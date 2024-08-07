/* eslint-disable @typescript-eslint/no-unused-vars */
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { SendMessageDto } from './dto/sendMessage.dto';
import { MongoClient } from 'mongodb';
import { QztWzt } from './chatbot.interface';
var similarity = require('compute-cosine-similarity'); // pure js lib, use import will cause error
import { ethers } from 'ethers';
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from './entities/chatLog.entity';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointReward__factory } from 'src/contract';
import { UserService } from 'src/user/user.service';
import { MPC } from 'src/shared/mpc';
import { ChatCompletionMessageParam } from 'openai/resources';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI); // for number recommendation based on input
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = 'gpt-4o-mini';

@Injectable()
export class ChatbotService {
  availableFunctions: { [key: string]: Function } = {
    getNumberRecommendation: this.getNumberRecommendation,
    getImage: this.getImage,
  };

  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
    private eventEmitter: EventEmitter2,
    private adminNotificationService: AdminNotificationService,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    private userService: UserService,
  ) {}

  async sendMessage(userId: number, payload: SendMessageDto): Promise<Array<{type: string, contents: string}>> {
    const chatLog = await this.chatLogRepository.findBy({ userId });
    // extract chat completion message from chatLog
    // @ts-ignore
    let messages: Array<ChatCompletionMessageParam> = chatLog.map(log => ({ role: log.role, content: log.content }));

    const initialContent = 
`You are human, and reply in casual conversation in simple English under 3 sentences.
Try to figure out my gender and slightly use some flirty words.
You can reply with image(to execute getImage function) if the topic regards something that can be visualized.
You should ONLY mention 4-Digits lottery when current topic is related to bet.
When I mention lost or number not matched in 4-Digits lottery, pity me / ask me to take a break / control the cost of betting.
Cutting knowledge date: October 2023, today date: ${new Date().toDateString()}.`;

    // there is an initial chat from Professor Rich in frontend: Hi How are you today?
    // TODO: add this into chatCompletion & database

    // TODO: if the conversation is too long, summarize it to save tokens

    if (messages.length === 0) {
      // initial chat, save initial chatLog in database
      await this.chatLogRepository.save(
        this.chatLogRepository.create({
          userId,
          role: 'system',
          content: initialContent,
        }),
      );

    } else {
      // naively update initialCotent to latest one in database
      // TODO: if today date is same, no need update database
      await this.chatLogRepository.update(
        chatLog[0].id,
        { content: initialContent },
      );
      // also update in messages
      messages[0].content = initialContent
    }

    // save user message into dabatase
    await this.chatLogRepository.save(
      this.chatLogRepository.create({
        userId,
        role: 'user',
        content: payload.message,
      }),
    );
    // add user message into messages
    messages.push({
      role: 'user',
      content: payload.message,
    });

    // submit to chatCompletion
    const completion = await openai.chat.completions.create({
      messages,
      model: model,
      tools: [
        {
          type: 'function',
          function: {
            name: 'getNumberRecommendation',
            description:
              'input message and get number recommendation from Wang Zi Tu',
            parameters: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'message i.e. I dream a car',
                },
              },
              required: ['message'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'getImage',
            description: 'get any image based on keywords',
            parameters: {
              type: 'object',
              properties: {
                keyword: {
                  type: 'string',
                  description: 'keyword from user message',
                },
              },
              required: ['keyword'],
            },
          }
        }
      ],
      // https://platform.openai.com/docs/guides/text-generation/how-should-i-set-the-temperature-parameter
      temperature: 1.2, // 0.0 to 2.0
    });
    const assistantMessage = completion.choices[0].message;

    // add assistantMessage into messages
    messages.push(assistantMessage);

    let replies: Array<{type: 'text' | 'image' | 'speech', contents: string}> = [];
    const toolCalls = assistantMessage.tool_calls;
    if (toolCalls) {
      // this message is to call functions
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionToCall = this.availableFunctions[functionName];
        const functionArgs = JSON.parse(toolCall.function.arguments); // possible empty {}
        let functionResponse;

        if (functionName === 'getNumberRecommendation') {
          functionResponse = await functionToCall(functionArgs.message);

        } else if (functionName === 'getImage') {
          functionResponse = await functionToCall(functionArgs.keyword);
          // add into bot replies(to user)
          replies.push({ type: 'image', contents: functionResponse });

        } else {
          // all other functions (without argument)
          functionResponse = await functionToCall();
        }

        if (functionName === 'getImage') {
          // functionResponse is image in base64, save into database
          await this.chatLogRepository.save(
            this.chatLogRepository.create({
              userId,
              role: 'tool',
              content: functionResponse,
            }),
          );
          // and add into messages
          // here treat as user ask bot what is in the image
          messages.push({
            role: 'user',
            content: [{
              type: 'image_url',
              image_url: { 'url': `data:image/png;base64,${functionResponse}` }
            }],
          })

        } else {
          // function response is object, save into database
          await this.chatLogRepository.save(
            this.chatLogRepository.create({
              userId,
              role: 'tool',
              content: JSON.stringify(functionResponse),
            }),
          );
          // and add into messages
          // bot will create reply based on the object
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: JSON.stringify(functionResponse),
          })
        }
      }

      // submit messages with functionResponse to chatCompletion
      const response = await openai.chat.completions.create({
        model: model,
        messages,
      });
      const assistantReplyBasedOnFunctionResponse = response.choices[0].message;

      // save the reply into database
      await this.chatLogRepository.save(
        this.chatLogRepository.create({
          userId,
          role: assistantReplyBasedOnFunctionResponse.role,
          content: assistantReplyBasedOnFunctionResponse.content,
        }),
      );

      // add into bot replies(to user)
      replies.push({ type: 'text', contents: assistantReplyBasedOnFunctionResponse.content });

    } else {
      // this message is normal message

      // add into bot replies(to user)
      replies.push({ type: 'text', contents: assistantMessage.content });

      // save the reply into database
      await this.chatLogRepository.save(
        this.chatLogRepository.create({
          userId,
          role: assistantMessage.role,
          content: assistantMessage.content,
        }),
      );
    }

    // convert assistant reply into speech
    const speech = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: replies[replies.length - 1].contents,
      speed: 1,
    })
    const speechInBuffer = Buffer.from(await speech.arrayBuffer());
    replies.push({ type: 'speech', contents: speechInBuffer.toString('base64') });

    // // 3 conversation daily get xp
    // let userMessageCount = 0;
    // feeds.forEach(feed => { if (feed.role === 'user') userMessageCount++ });
    // if (userMessageCount === 3) {
    //   // only once xp reward per utc day
    //   const todayAtUtc0 = new Date()
    //   todayAtUtc0.setUTCHours(0, 0, 0, 0); // utc 00:00 of today
    //   const pointTx = await this.pointTxRepository.findOne({
    //     where: { walletId: id },
    //     order: { id: 'DESC' },
    //   });
    //   if (pointTx && pointTx.createdDate > todayAtUtc0) {
    //     // do nothing

    //   } else {
    //     // pass to handlePointRewardEvent() for on-chain interaction
    //     this.eventEmitter.emit(
    //       'chatbot.service.handlePointReward',
    //       id,
    //       chatLog.id,
    //     );
    //   }
    // };

    return replies;
  }

  @OnEvent('chatbot.service.handlePointReward', { async: true })
  async handlePointRewardEvent(userId: number, chatLogId: number): Promise<void> {
    try {
      const userWallet = await this.userWalletRepository.findOneBy({ userId });

      // create pointTx
      const pointTx = this.pointTxRepository.create({
        txType: 'CHAT',
        amount: 1,
        startingBalance: 0,
        endingBalance: 0,
        walletId: userWallet.id,
      });
      await this.pointTxRepository.save(pointTx);

      // set point reward on-chain
      const provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);
      const pointRewardBot = new ethers.Wallet(
        await MPC.retrievePrivateKey(process.env.POINT_REWARD_BOT_ADDRESS),
        provider
      );
      const pointRewardContract = PointReward__factory.connect(process.env.POINT_REWARD_CONTRACT_ADDRESS, pointRewardBot);
      const txResponse = await pointRewardContract.updateRewardPoint(
        3, // Action.OtherReward
        ethers.AbiCoder.defaultAbiCoder().encode(
          // (address user, uint256 _xp) = abi.decode(params, (address, uint256));
          ['address', 'uint256'],
          [userWallet.walletAddress, ethers.parseEther('1')]
        ),
        { gasLimit: 50000 }, // gasLimit increased by 30%
      );

      // check native token balance for point reward bot
      this.eventEmitter.emit(
        'gas.service.reload',
        pointRewardBot.address,
        Number(process.env.OPBNB_CHAIN_ID),
      );

      const txReceipt = await txResponse.wait();
      if (txReceipt.status === 1) {
        // fetch last pointTx for endingBalance
        // note: no way to check if the pointTx is valid
        // (pointTx created but actually failed off-chain/on-chain in any reason)
        const lastPointTx = await this.pointTxRepository.findOne({
          where: { walletId: userWallet.id },
          order: { id: 'DESC' },
        })

        // update pointTx
        pointTx.startingBalance = Number(lastPointTx.endingBalance);
        pointTx.endingBalance = Number(pointTx.startingBalance) + 1;
        await this.pointTxRepository.save(pointTx);

        // update userWallet
        userWallet.pointBalance = Number(userWallet.pointBalance) + 1;
        await this.userWalletRepository.save(userWallet);

        // inform user
        await this.userService.setUserNotification(
          userWallet.id,
          {
            type: 'getXpNotification',
            title: 'XP Reward Get',
            message: 'You get 1 xp reward from daily conversation with Professor Rich.',
            walletTxId: null,
          }
        );

      } else {
        throw new Error(`tx failed, txHash: ${txReceipt.hash}`)
      }

    } catch (error) {
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occured in chatbot.service.handlePointRewardEvent, error: ${error}, userId: ${userId}`,
        'Error',
        'Error in chatbot.service',
        true,
      );
    }
  }

  async getNumberRecommendation(
    message: string,
  ): Promise<{ recommendedNumber: string; meaning: string }> {
    let qztwzt: QztWzt[];

    // fetch all number:embedding(text) recommendation from mongodb
    try {
      await client.connect();
      const db = client.db('fdgpt').collection('qztwzt');
      const cursor = db.find();
      qztwzt = <QztWzt[]>await cursor.toArray();
    
    } catch (e) {
      console.error(e);
      throw new HttpException('Cannot connect to qztwzt database', HttpStatus.INTERNAL_SERVER_ERROR);

    } finally {
      await client.close();
    }

    // create embedding for input message
    const resp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
    });
    const queryEmbedding = resp.data[0].embedding;

    // find the nearest number:embedding pair
    let largestSimilarity = 0;
    let nearestIndex = 0;
    for (let i = 0; i < qztwzt.length; i++) {
      const embedding = qztwzt[i].embedding;
      const s = similarity(embedding, queryEmbedding);
      if (s && s > largestSimilarity) {
        largestSimilarity = s;
        nearestIndex = i;
      }
    }

    // return the nearest number and its meaning
    const obj = {
      recommendedNumber: qztwzt[nearestIndex].number,
      meaning: qztwzt[nearestIndex].english,
    };
    return obj;
  }

  async getImage(keyword?: string): Promise<string> {
    const image = await openai.images.generate({
      prompt: keyword ?? "any image",
      model: 'dall-e-2',
      n: 1,
      quality: 'standard',
      response_format: 'b64_json',
      size: '256x256',
    });
    return image.data[0].b64_json;
  }
}
