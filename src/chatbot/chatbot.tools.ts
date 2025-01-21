import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';
import { QztWzt } from './chatbot.interface';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const similarity = require('compute-cosine-similarity'); // pure js lib, use import will cause error
import { ChatCompletionTool } from 'openai/resources';
import axios from 'axios';
import { ConfigService } from 'src/config/config.service';

import * as dotenv from 'dotenv';
dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI); // for number recommendation based on input
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

@Injectable()
export class ChatbotTools {
  private readonly logger = new Logger(ChatbotTools.name);

  availableTools: ChatCompletionTool[] = [
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
  ];

  constructor(private configService: ConfigService) {}

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
}
