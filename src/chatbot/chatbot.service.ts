import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { SendMessageDto } from './dto/sendMessage.dto';
import { MongoClient } from 'mongodb';
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from './entities/chatLog.entity';
import { Repository } from 'typeorm';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { PointTx } from 'src/point/entities/point-tx.entity';
// import { UserService } from 'src/user/user.service';
import { ChatCompletionMessageParam } from 'openai/resources';
import { PointTxType } from 'src/shared/enum/txType.enum';
import { ChatbotTools } from './chatbot.tools';
import { ConfigService } from 'src/config/config.service';
import { Replies } from './chatbot.types';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  client: MongoClient;
  openai: OpenAI;
  model: string;

  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(PointTx)
    private pointTxRepository: Repository<PointTx>,
    // private userService: UserService,
    private configService: ConfigService,
    private chatbotTools: ChatbotTools,
  ) {
    this.client = new MongoClient(this.configService.get('MONGODB_URI'));
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
    this.model = 'gpt-4o-mini';
  }

  async sendMessage(
    userId: number,
    payload: SendMessageDto,
  ): Promise<Array<{ type: string; content: string }>> {
    const chatLog = await this.chatLogRepository.findBy({ userId });
    // extract chat completion message from chatLog
    let messages: Array<ChatCompletionMessageParam> = chatLog
      .filter((log) => log.role !== 'tool')
      .map((log) => ({
        role: log.role as 'system' | 'user' | 'assistant',
        content: log.content,
      }));

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
            "Hey! 👋 I'm your FUYO AI buddy. Got questions about 4D draws, results, or just wanna chat about lucky numbers? Let's talk—I'm here for you! 🍀",
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
    const completion = await this.openai.chat.completions.create({
      messages,
      model: this.model,
      tools: this.chatbotTools.availableTools,
      // https://platform.openai.com/docs/guides/text-generation/how-should-i-set-the-temperature-parameter
      temperature: 1.2, // 0.0 to 2.0
    });
    const assistantMessage = completion.choices[0].message;

    // add assistantMessage into messages
    messages.push(assistantMessage);

    const replies: Array<Replies> = [];
    const toolCalls = assistantMessage.tool_calls;
    if (toolCalls) {
      // this message is to call functions
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments); // possible empty {}
        let functionResponse: any;

        if (functionName === 'getNumberRecommendation') {
          functionResponse = await this.chatbotTools.getNumberRecommendation(
            functionArgs.message,
          );
        } else if (functionName === 'getImage') {
          functionResponse = await this.chatbotTools.getImage(
            functionArgs.keyword,
          );
          // add into bot replies(to user)
          replies.push({ type: 'image', content: functionResponse });
        } else if (functionName === 'getFuyoDocumentation') {
          functionResponse = await this.chatbotTools.getFuyoDocumentation(
            functionArgs.question,
          );
        } else if (functionName === 'searchForNews') {
          functionResponse = await this.chatbotTools.searchForNews(
            functionArgs.searchKeywords,
          );
        } else {
          throw new Error('Unknown function name');
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
      const response = await this.openai.chat.completions.create({
        model: this.model,
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
      const speech = await this.openai.audio.speech.create({
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
