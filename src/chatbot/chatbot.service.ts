import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SendMessageDto } from './dto/sendMessage.dto';
import { MongoClient } from 'mongodb';
import { QztWzt } from './chatbot.interface';
var similarity = require('compute-cosine-similarity'); // pure js lib, use import will cause error
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from './entities/chatLog.entity';
import { Repository } from 'typeorm';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
// import { UserService } from 'src/user/user.service';
import { ChatCompletionMessageParam } from 'openai/resources';
import { PointTxType } from 'src/shared/enum/txType.enum';
import axios from 'axios';
import { ConfigService } from 'src/config/config.service';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI); // for number recommendation based on input
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = 'gpt-4o-mini';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  availableFunctions: { [key: string]: Function } = {
    getNumberRecommendation: (message: string) =>
      this.getNumberRecommendation(message),
    getImage: (keyword?: string) => this.getImage(keyword),
    getFuyoDocumentation: (question: string) =>
      this.getFuyoDocumentation(question),
    searchForNews: (searchKeywords: string) =>
      this.searchForNews(searchKeywords),
  };

  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    // private userService: UserService,
    private configService: ConfigService,
  ) {}

  async sendMessage(
    userId: number,
    payload: SendMessageDto,
  ): Promise<Array<{ type: string; content: string }>> {
    const chatLog = await this.chatLogRepository.findBy({ userId });
    // extract chat completion message from chatLog
    // @ts-ignore
    let messages: Array<ChatCompletionMessageParam> = chatLog
      .map((log) => ({ role: log.role, content: log.content }))
      .filter((log) => log.role !== 'tool');

    const initialContent = `You are a human named Professor Fuyo, live in Fuyo app and Fuyo mini game. Please reply in casual conversation in simple English under 3 sentences.
Fuyo app is a revolutionizing 4D lottery gaming with blockchain, AI, and chatGPT.
Try to figure out user gender and slightly use some flirty words.
You can reply with image(to execute getImage function) if the topic regards something that can be visualized.
You should ONLY mention 4-Digits lottery when current topic is related to bet, else just normal chit-chat.
When user mention lost or number not matched in 4-Digits lottery, pity user / ask user to take a break / control the cost of betting.
When user ask anything, search for Fuyo documentation.
When user ask something that exceed your cutting knowledge date, trigger searchForNews function.
Today date: ${new Date().toDateString()}.`;

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
          content:
            "Hello there, lucky seeker! I'm Professor Fuyo, Ready to turn your dreams into numbers?",
        },
      ];

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
      await this.chatLogRepository.update(chatLog[0].id, {
        content: initialContent,
      });
      // also update in messages
      messages[0].content = initialContent;
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
          },
        },
        {
          type: 'function',
          function: {
            name: 'getFuyoDocumentation',
            description: 'get Documentation for Fuyo App and Fuyo Mini Game',
            parameters: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'question i.e. How to bet',
                },
              },
              required: ['question'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'searchForNews',
            description: 'get latest news / information about the topic',
            parameters: {
              type: 'object',
              properties: {
                searchKeywords: {
                  type: 'string',
                  description: 'search keywords',
                },
              },
              required: ['searchKeywords'],
            },
          },
        },
      ],
      // https://platform.openai.com/docs/guides/text-generation/how-should-i-set-the-temperature-parameter
      temperature: 1.2, // 0.0 to 2.0
    });
    const assistantMessage = completion.choices[0].message;

    // add assistantMessage into messages
    messages.push(assistantMessage);

    const replies: Array<{
      type: 'text' | 'image' | 'speech';
      content: string;
    }> = [];
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
        } else if (functionName === 'getFuyoDocumentation') {
          functionResponse = await functionToCall(functionArgs.question);
        } else if (functionName === 'searchForNews') {
          functionResponse = await functionToCall(functionArgs.searchKeywords);
        } else {
          // all other functions (without argument)
          functionResponse = await functionToCall();
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content:
            functionName === 'getImage'
              ? functionArgs.keyword
              : JSON.stringify(functionResponse),
        });

        if (functionName === 'getImage') {
          // functionResponse is image in base64, save into database
          await this.chatLogRepository.save(
            this.chatLogRepository.create({
              userId,
              role: 'tool',
              content: functionResponse,
            }),
          );
        }
      }

      const imageResponse = replies.find((r) => r.type === 'image')?.content;
      if (imageResponse) {
        // here treat as user ask bot what is in the image
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageResponse}` },
            },
          ],
        });
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
      replies.push({
        type: 'text',
        content: assistantReplyBasedOnFunctionResponse.content,
      });
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
    if (payload.source === 'fuyoapp') {
      const speech = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'nova',
        input: replies[replies.length - 1].content,
        speed: 1,
      });
      const speechInBuffer = Buffer.from(await speech.arrayBuffer());
      replies.push({
        type: 'speech',
        content: speechInBuffer.toString('base64'),
      });
    }

    // 3 conversation daily get xp
    // loop backward and check all the chats that over 00:00 UTC today
    // get xp only if these chats contains 2 user role + over 2 assistant role
    // 2 instead of 3 because, newest chat log haven't added into database
    // and we assume that at least +1 chat for both user and assistant when reach here
    const todayAtUtc0 = new Date();
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

      // const lastPointTx = await this.pointTxRepository.findOne({
      //   where: { walletId: userWallet.id },
      //   order: { id: 'DESC' },
      // });

      const pointAmount = 10;
      const pointTx = this.pointTxRepository.create({
        txType: PointTxType.CHAT,
        amount: pointAmount,
        walletId: userWallet.id,
      });
      pointTx.startingBalance = Number(userWallet.pointBalance);
      pointTx.endingBalance = Number(pointTx.startingBalance) + pointAmount;
      await this.pointTxRepository.save(pointTx);

      // update userWallet
      userWallet.pointBalance = Number(userWallet.pointBalance) + pointAmount;
      await this.userWalletRepository.save(userWallet);

      // // inform user
      // await this.userService.setUserNotification(userWallet.id, {
      //   type: 'getXpNotification',
      //   title: 'XP Reward Get',
      //   message: `You get ${pointAmount} XP reward from daily conversation with Professor Fuyo.`,
      //   walletTxId: null,
      // });
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
      this.logger.error(e);
      throw new HttpException(
        'Cannot connect to qztwzt database',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      prompt: keyword ?? 'any image',
      model: 'dall-e-2',
      n: 1,
      quality: 'standard',
      response_format: 'b64_json',
      size: '256x256',
    });
    return image.data[0].b64_json;
  }

  async getFuyoDocumentation(question: string): Promise<string> {
    let fuyoDocs = [];
    try {
      await client.connect();
      const db = client.db('fdgpt').collection('fuyoDocs');
      const cursor = db.find();
      fuyoDocs = await cursor.toArray();
    } catch (e) {
      this.logger.error(e);
      throw new HttpException(
        'Cannot connect to fuyoDocs database',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await client.close();
    }

    // create embedding for input message
    const resp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    });
    const queryEmbedding = resp.data[0].embedding;

    // // find the nearest
    // let largestSimilarity = 0;
    // let nearestIndex = 0;
    // for (let i = 0; i < fuyoDocs.length; i++) {
    //   const embedding = fuyoDocs[i].embedding;
    //   const s = similarity(embedding, queryEmbedding);
    //   if (s && s > largestSimilarity) {
    //     largestSimilarity = s;
    //     console.log('similarity:', s, fuyoDocs[i].url);
    //     nearestIndex = i;
    //   }
    // }

    // find the 2 nearest
    let largestSimilarity = 0;
    let secondLargestSimilarity = 0;
    let nearestIndex = -1;
    let secondNearestIndex = -1;
    for (let i = 0; i < fuyoDocs.length; i++) {
      const embedding = fuyoDocs[i].embedding;
      const s = similarity(embedding, queryEmbedding);
      if (s && s > largestSimilarity) {
        // Shift the largest to the second largest
        secondLargestSimilarity = largestSimilarity;
        secondNearestIndex = nearestIndex;
        // Update the largest similarity and index
        largestSimilarity = s;
        nearestIndex = i;
      } else if (s && s > secondLargestSimilarity) {
        // Update the second largest similarity and index
        secondLargestSimilarity = s;
        secondNearestIndex = i;
      }
    }

    return (
      fuyoDocs[nearestIndex].docs + '\n' + fuyoDocs[secondNearestIndex].docs
    );
  }

  async searchForNews(searchKeywords: string): Promise<string> {
    const res = await axios.get(
      `https://api.search.brave.com/res/v1/news/search?q=${searchKeywords}&count=5&freshness=pw`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.configService.get(
            'BRAVE_SEARCH_API_KEY',
          ),
        },
      },
    );
    const results = res.data.results;
    const titleAndDescription = results.map((result: any) => {
      return {
        title: result.title,
        description: result.description,
        date: result.page_age,
      };
    });
    return JSON.stringify(titleAndDescription);
  }

  async getHistoricalMessage(
    userId: number,
    limit: number,
  ): Promise<Array<{ role: string; content: string }>> {
    const chatLog = await this.chatLogRepository
      .createQueryBuilder('chatLog')
      .select('chatLog.role')
      .addSelect('chatLog.content')
      .where('userId = :userId', { userId })
      .andWhere('role != :role', { role: 'system' })
      .orderBy('id', 'DESC')
      .getMany();
    const historicalMessage = chatLog.slice(0, limit);
    return historicalMessage;
  }
}
