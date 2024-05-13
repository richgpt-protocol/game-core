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
import { Message } from './entities/message.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { PointReward__factory } from 'src/contract';
import * as dotenv from 'dotenv';
import { UserService } from 'src/user/user.service';
dotenv.config();

const client = new MongoClient('mongodb://localhost:27017'); // for number recommendation based on input
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = 'gpt-3.5-turbo';

@Injectable()
export class ChatbotService {
  availableFunctions: { [key: string]: Function } = {
    getNumberRecommendation: this.getNumberRecommendation,
  };

  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    private eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private adminNotificationService: AdminNotificationService,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    private userService: UserService,
  ) {}

  async sendMessage(id: number, payload: SendMessageDto): Promise<string> {
    let chatLog: ChatLog;

    // fetch previous messages from cache
    const feeds: any[] = await this.cacheManager.get(id.toString()) ?? [];

    const isInitialMessage = payload.isInitialMessage;
    if (isInitialMessage) {
      chatLog = await this.chatLogRepository.save(
        this.chatLogRepository.create({ userId: id }),
      );

      const initialRole = 'system';
      const initialContent =
        'You are a fun and playful assistant.' +
        'You assist me who likely to bet in 4D lottery.' +
        '\n' +
        'Your reply should within 3 sentences, make the reply close to lottery if possible.' +
        'Your reply may include emoji.' +
        '\n' +
        "If and only if I ask for number, provide me a 4-Digits number between 0000 and 9999. Don't tell me it is random." +
        'If I ask why this number, tell me any reason besides random.' +
        'If I ask how to deposit, guide me to the homepage and press the deposit logo.' +
        '\n' +
        `Today is ${new Date(Date.now()).toString()}.`;
      const message = await this.messageRepository.save(
        this.messageRepository.create({
          role: initialRole,
          content: initialContent,
          chatLog,
        }),
      );
      chatLog.messages = [message];
      await this.chatLogRepository.save(chatLog);

      // initiate / clear previous messages in cache if isInitialMessage
      feeds.length = 0; // clear array
      await this.cacheManager.set(id.toString(), feeds, 0);

      feeds.push({ role: initialRole, content: initialContent });

    } else {
      // isInitialMessage == false
      // fetch previous messages from db
      chatLog = await this.chatLogRepository
        .createQueryBuilder('chatLog')
        .select()
        .leftJoinAndSelect('chatLog.messages', 'message')
        .where({ userId: id })
        .orderBy('chatLog.id', 'DESC')
        .getOne();
    }

    // add current message to feeds
    feeds.push({ role: 'user', content: payload.message });
    // set feeds into cache
    await this.cacheManager.set(id.toString(), feeds, 0);
    // save current message into db
    await this.messageRepository.save(
      this.messageRepository.create({
        role: 'user',
        content: payload.message,
        chatLog,
      }),
    );

    // submit to chatgpt
    const completion = await openai.chat.completions.create({
      messages: feeds,
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
      ],
    });
    const assistantMessage = completion.choices[0].message;

    // save this message into db
    await this.messageRepository.save(
      this.messageRepository.create({
        role: assistantMessage.role,
        content: assistantMessage.content,
        chatLog,
      }),
    );

    const toolCalls = assistantMessage.tool_calls;
    let replied = '';
    if (toolCalls) {
      // this message is to call functions
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionToCall = this.availableFunctions[functionName];
        const functionArgs = JSON.parse(toolCall.function.arguments); // possible empty {}
        let functionResponse;

        // console.info(`functionName: ${functionName}`)
        // console.info(functionArgs)

        if (functionName === 'getNumberRecommendation') {
          functionResponse = await functionToCall(functionArgs.message);
        } else {
          // all other functions (without argument)
          functionResponse = await functionToCall();
        }
        // console.info(functionResponse)

        feeds.push(assistantMessage); // message contain function call
        feeds.push({
          // message contain function response
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(functionResponse),
        });
        // set feeds into cache
        await this.cacheManager.set(id.toString(), feeds, 0);

        // save function reponse into db
        await this.messageRepository.save(
          this.messageRepository.create({
            role: 'tool',
            content: JSON.stringify(functionResponse),
            chatLog,
          }),
        );
      }

      // submit everything to chatgpt
      const response = await openai.chat.completions.create({
        model: model,
        messages: feeds,
      });
      const assistantMessageWithFunctionResponse = response.choices[0].message;

      // save assistant message with function response into db
      await this.messageRepository.save(
        this.messageRepository.create({
          role: assistantMessageWithFunctionResponse.role,
          content: assistantMessageWithFunctionResponse.content,
          chatLog,
        }),
      );

      replied = assistantMessageWithFunctionResponse.content;

    } else {
      // this message is normal message
      replied = assistantMessage.content;

      // set assistant message into cache
      feeds.push(assistantMessage);
      await this.cacheManager.set(id.toString(), feeds, 0);
    }

    // 3 conversation daily get xp
    let userMessageCount = 0;
    feeds.forEach(feed => { if (feed.role === 'user') userMessageCount++ });
    if (userMessageCount === 3) {
      // only once xp reward per utc day
      const todayAtUtc0 = new Date()
      todayAtUtc0.setUTCHours(0, 0, 0, 0); // utc 00:00 of today
      const pointTx = await this.pointTxRepository.findOne({
        where: { walletId: id },
        order: { id: 'DESC' },
      });
      if (pointTx && pointTx.createdDate > todayAtUtc0) {
        // do nothing

      } else {
        // pass to handlePointRewardEvent() for on-chain interaction
        this.eventEmitter.emit(
          'chatbot.service.handlePointReward',
          id,
          chatLog.id,
        );
      }
    };

    return replied;
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
        chatLogId,
      });
      await this.pointTxRepository.save(pointTx);

      // set point reward on-chain
      const provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);
      const pointRewardBot = new ethers.Wallet(process.env.POINT_REWARD_BOT_PRIVATE_KEY, provider);
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
}
