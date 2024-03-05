/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import OpenAI from "openai"
import { SendMessageDto } from './dto/sendMessage.dto';
import { MongoClient, WithId } from 'mongodb'
import { QztWzt } from './chatbot.interface'
var similarity = require('compute-cosine-similarity') // pure js lib, use import will cause error
import { InjectRepository } from '@nestjs/typeorm';
import { ChatLog } from './entities/chatLog.entity';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import * as dotenv from 'dotenv'
dotenv.config()

const client = new MongoClient('mongodb://localhost:27017') // for number recommendation based on input
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})
const model = "gpt-3.5-turbo"

@Injectable()
export class ChatbotService {
  feeds = []
  initialMessageTimestamp: { [key: string]: string} = {}
  availableFunctions: {[key: string]: Function} = {
    'getNumberRecommendation': this.getNumberRecommendation,
  }

  constructor(
    @InjectRepository(ChatLog)
    private chatLogRepository: Repository<ChatLog>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  async sendMessage(id: number, payload: SendMessageDto): Promise<string> {
    let chatLog: ChatLog;

    const isInitialMessage = payload.isInitialMessage
    if (isInitialMessage) {
      chatLog = await this.chatLogRepository.save(
        this.chatLogRepository.create({ userId: id })
      )

      const initialRole = 'system';
      const initialContent = "You are a fun and playful assistant." +
        "You assist me who likely to bet in 4D lottery." +
        "\n" +
        "Your reply should within 3 sentences, make the reply close to lottery if possible." +
        "Your reply may include emoji." +
        "\n" +
        "If and only if I ask for number, provide me a 4-Digits number between 0000 and 9999. Don't tell me it is random." +
        "If I ask why this number, tell me any reason besides random." +
        "\n" +
        `Current year is ${(new Date(Date.now())).getFullYear()}.`
      const message = await this.messageRepository.save(
        this.messageRepository.create({
          role: initialRole,
          content: initialContent,
          chatLog
        })
      )
      chatLog.messages = [message]
      await this.chatLogRepository.save(chatLog)

      this.feeds.push({ 'role': initialRole, 'content': initialContent })

    } else { // isInitialMessage == false
      // fetch previous messages from db
      chatLog = await this.chatLogRepository
        .createQueryBuilder('chatLog')
        .select()
        .leftJoinAndSelect('chatLog.messages', 'message')
        .where({ userId: id })
        .orderBy('chatLog.id', 'DESC')
        .getOne()
      for (const message of chatLog.messages) {
        this.feeds.push({ 'role': message.role, 'content': message.content })
      }
    }

    // add current message to feeds
    this.feeds.push({ 'role': 'user', 'content': payload.message })
    // save current message into db
    const userMessage = await this.messageRepository.save(
      this.messageRepository.create({
        role: 'user',
        content: payload.message,
        chatLog
      })
    )

    // submit to chatgpt
    const completion = await openai.chat.completions.create({
      messages: this.feeds,
      model: model,
      tools: [
        {
          type: 'function',
          function: {
            name: 'getNumberRecommendation',
            description: 'input message and get number recommendation from Wang Zi Tu',
            parameters: {
              type: 'object',
              properties: {
                message: {
                  type: "string",
                  description: "message i.e. I dream a car",
                },
              },
              required: ['message']
            }
          }
        },
      ]
    })
    const assistantMessage = completion.choices[0].message

    // save this message into db
    await this.messageRepository.save(
      this.messageRepository.create({
        role: assistantMessage.role,
        content: assistantMessage.content,
        chatLog
      })
    )

    const toolCalls = assistantMessage.tool_calls
    let replied = ''
    if (toolCalls) {
      // this message is to call functions
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name
        const functionToCall = this.availableFunctions[functionName]
        const functionArgs = JSON.parse(toolCall.function.arguments) // possible empty {}
        let functionResponse;
        
        // console.info(`functionName: ${functionName}`)
        // console.info(functionArgs)
  
        if (functionName === 'getNumberRecommendation') {
          functionResponse = await functionToCall(functionArgs.message)
  
        } else {
          // all other functions (without argument)
          functionResponse = await functionToCall()
        }
        // console.info(functionResponse)

        this.feeds.push(assistantMessage) // message contain function call
        this.feeds.push({ // message contain function response
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(functionResponse),
        })

        // save function reponse into db
        await this.messageRepository.save(
          this.messageRepository.create({
            role: "tool",
            content: JSON.stringify(functionResponse),
            chatLog
          })
        )
      }

      // submit everything to chatgpt
      const response = await openai.chat.completions.create({ model: model, messages: this.feeds })
      const assistantMessageWithFunctionResponse = response.choices[0].message

      // save assistant message with function response into db
      await this.messageRepository.save(
        this.messageRepository.create({
          role: assistantMessageWithFunctionResponse.role,
          content: assistantMessageWithFunctionResponse.content,
          chatLog
        })
      )

      replied = assistantMessageWithFunctionResponse.content

    } else {
      // this message is normal message
      replied = assistantMessage.content
    }

    return replied
  }

  async getNumberRecommendation(message: string)
    : Promise<{ recommendedNumber: string, meaning: string }>
  {
    let qztwzt: QztWzt[]

    try {
      await client.connect()
      const db = client.db('fdgpt').collection('qztwzt')
      const cursor = db.find()
      qztwzt = <QztWzt[]>await cursor.toArray()

    } finally {
      await client.close()
    }
    
    const resp = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: message,
    })
    const queryEmbedding = resp.data[0].embedding

    let largestSimilarity = 0
    let nearestIndex = 0
    for (let i = 0; i < qztwzt.length; i++) {
      const embedding = qztwzt[i].embedding
      const s = similarity(embedding, queryEmbedding)
      if (s && s > largestSimilarity) {
        largestSimilarity = s
        nearestIndex = i
      }
    }
    
    const obj = {
      recommendedNumber: qztwzt[nearestIndex].number,
      meaning: qztwzt[nearestIndex].english
    }
    return obj
  }
}
