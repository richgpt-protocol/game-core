import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { SendMessageDto } from './dto/sendMessage.dto';
import { MongoClient } from 'mongodb';
import { QztWzt } from './chatbot.interface';
var similarity = require('compute-cosine-similarity'); // pure js lib, use import will cause error
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from './entities/chatLog.entity';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { UserService } from 'src/user/user.service';
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

  async sendMessage(userId: number, payload: SendMessageDto): Promise<Array<{type: string, content: string}>> {
    const chatLog = await this.chatLogRepository.findBy({ userId });
    // extract chat completion message from chatLog
    // @ts-ignore
    let messages: Array<ChatCompletionMessageParam> = chatLog.map(log => ({ role: log.role, content: log.content }));

    const initialContent = 
`You are a human named Professor Rich, please reply in casual conversation in simple English under 3 sentences.
Try to figure out my gender and slightly use some flirty words.
You can reply with image(to execute getImage function) if the topic regards something that can be visualized.
You should ONLY mention 4-Digits lottery when current topic is related to bet.
When I mention lost or number not matched in 4-Digits lottery, pity me / ask me to take a break / control the cost of betting.
Today date: ${new Date().toDateString()}.`;
// Cutting knowledge date: October 2023, today date: ${new Date().toDateString()}.`;

    // there is an initial chat from Professor Rich in frontend: Hi How are you today?
    // TODO: add this into chatCompletion & database

    // TODO: if the conversation is too long, summarize it to save tokens

    if (messages.length === 0) {
      // initial chat
      messages = [
        {
          role: 'system',
          content: initialContent,
        },
        {
          role: 'assistant',
          content: "Hello there, lucky seeker! I'm Professor Rich, Ready to turn your dreams into numbers?",
        }
      ]

      // save initial chatLog in database
      await this.chatLogRepository.save([
        this.chatLogRepository.create({
          userId,
          role: 'system',
          content: messages[0].content as string,
        }),
        this.chatLogRepository.create({
          userId,
          role: 'assistant',
          content: messages[1].content as string,
        }),
      ]);

    } else {
      // update latest initialContent into database
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

    let replies: Array<{type: 'text' | 'image' | 'speech', content: string}> = [];
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
          replies.push({ type: 'image', content: functionResponse });

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
          // first message is responding to tool_calls, which is a compulsory for now
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            content: '', // should be image in base64 but will throw error because too large to process
          })
          // second message
          // here treat as user ask bot what is in the image
          messages.push({
            role: 'user',
            content: [{
              type: 'image_url',
              image_url: { 'url': `data:image/png;base64,${functionResponse}` }
            }],
          })

        } else {
          // function response is object, add into messages
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
      replies.push({ type: 'text', content: assistantReplyBasedOnFunctionResponse.content });

    } else {
      // this message is normal message

      // add into bot replies(to user)
      replies.push({ type: 'text', content: assistantMessage.content });

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
      input: replies[replies.length - 1].content,
      speed: 1,
    })
    const speechInBuffer = Buffer.from(await speech.arrayBuffer());
    replies.push({ type: 'speech', content: speechInBuffer.toString('base64') });

    // 3 conversation daily get xp
    // loop backward and check all the chats that over 00:00 UTC today
    // get xp only if these chats contains 2 user role + over 2 assistant role
    // 2 instead of 3 because, newest chat log haven't added into database
    // and we assume that at least +1 chat for both user and assistant when reach here
    const todayAtUtc0 = new Date()
    todayAtUtc0.setUTCHours(0, 0, 0, 0); // utc 00:00 of today
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    for (let i = chatLog.length - 1; i >= 0; i--) {
      if (chatLog[i].createAt > todayAtUtc0) {
        if (chatLog[i].role === 'user') {
          userMessageCount++;
        } else if (chatLog[i].role === 'assistant') {
          assistantMessageCount++;
        }
      }
    }

    // only once xp reward per utc day
    if (userMessageCount === 2 && assistantMessageCount >= 2) {
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
    }

    return replies;
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

  async getHistoricalMessage(userId: number, limit: number): Promise<Array<{role: string, content: string}>> {
    // const chatLog = await this.chatLogRepository.findBy({ userId });
    const chatLog = await this.chatLogRepository
      .createQueryBuilder('chatLog')
      .select('chatLog.role')
      .addSelect('chatLog.content')
      .where('userId = :userId', { userId })
      .andWhere('role != :role', { role: 'system' })
      .orderBy('id', 'DESC')
      .getMany();
    // console.log(chatLog);
    const historicalMessage = chatLog.slice(0, limit);
    return historicalMessage;
  }
}
