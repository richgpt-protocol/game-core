/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import OpenAI from "openai"
import { ChatCompletionMessageParam } from 'openai/resources';
import { SendMessageDto } from './dto/sendMessage.dto';
import { MongoClient, WithId } from 'mongodb'
import { Data, QztWzt } from './chatbot.interface'
var similarity = require('compute-cosine-similarity') // pure js lib, use import will cause error
import * as dotenv from 'dotenv'
dotenv.config()

const client = new MongoClient('mongodb://localhost:27017')
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY})
const model = "gpt-3.5-turbo"

@Injectable()
export class ChatbotService {
  feeds: { [key: string]: ChatCompletionMessageParam[] } = {}
  initialMessageTimestamp: { [key: string]: string} = {}
  availableFunctions: {[key: string]: Function} = {
    'getNumberRecommendation': this.getNumberRecommendation,
  }

  constructor() {}

  async sendMessage(payload: SendMessageDto): Promise<string> {
    const isInitialMessage = payload.isInitialMessage
    const userId = payload.userId
    if (isInitialMessage) {
      if (userId in this.feeds) {
        if (this.feeds[userId].length > 0) {
          const obj = {}
          obj[this.initialMessageTimestamp[userId]] = JSON.stringify(this.feeds[userId])
          try {
            await client.connect()
            const db = client.db('fdgpt').collection('chatlog')
            const result = <Data>await db.findOne({ userId: userId })
            if (result) {
              await db.updateOne(
                { userId: userId },
                { $set: { logs: [...result.logs, obj] } }
              )

            } else {
              await db.insertOne({
                userId: userId,
                logs: [obj]
              })
            }
        
          } finally {
            await client.close()
          }
        }
      }
      this.feeds[userId] = [{
        "role": "system",
        "content": 
          "You are a fun and playful assistant." +
          "You assist me who likely to bet in 4D lottery." +
          "\n" +
          "Your reply should within 3 sentences, make the reply close to lottery if possible." +
          "Your reply may include emoji." +
          "\n" +
          "If and only if I ask for number, provide me a 4-Digits number between 0000 and 9999. Don't tell me it is random." +
          "If I ask why this number, tell me any reason besides random." +
          "\n" +
          `Current year is ${(new Date(Date.now())).getFullYear()}.`
      }]
      this.initialMessageTimestamp[userId] = Date.now().toString()
    }

    const feed: ChatCompletionMessageParam = { 'role': 'user', 'content': payload.message  }
    this.feeds[userId].push(feed)

    const completion = await openai.chat.completions.create({
      messages: this.feeds[userId],
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
    const message = completion.choices[0].message
    const toolCalls = message.tool_calls
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
        
        // handle functionResponse if not return in if statement
        // console.info(functionResponse)
        this.feeds[userId].push(message) // message contain function call
        this.feeds[userId].push({ // message contain function response
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(functionResponse),
        })
        const response = await openai.chat.completions.create({ model: model, messages: this.feeds[userId] })
        replied = response.choices[0].message.content
      }

    } else {
      replied = completion.choices[0].message.content
    }

    this.feeds[userId].push({ 'role': 'assistant', 'content': replied  })

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
