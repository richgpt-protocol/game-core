import { Injectable } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { ConfigService } from 'src/config/config.service';

interface QueueHandler {
  jobHandler: (job: Job) => Promise<any>;
  failureHandler?: (job: Job, error: Error) => Promise<any>;
}

@Injectable()
export class QueueService {
  private handlers: Map<string, Map<string, QueueHandler>> = new Map();
  private queues: Map<string, Queue> = new Map();
  private redisHost: string;
  private redisPort: number;

  constructor(private readonly configService: ConfigService) {
    this.redisHost = this.configService.get('REDIS_HOST');
    this.redisPort = +this.configService.get('REDIS_PORT');
  }

  async onFailed(job: Job, error: Error) {
    console.error(
      `Job ${job.id} failed with error: ${error.message}. Attempts ${job.attemptsMade}`,
    );

    // if (job.attemptsMade >= job.opts.attempts) {
    const queueHandlers = this.handlers.get(job.queueName);
    if (queueHandlers) {
      const handler = queueHandlers.get(job.data.queueType);
      if (handler && handler.failureHandler) {
        try {
          await handler.failureHandler(job, error);
        } catch (error) {
          console.error(error);
        }
      } else {
        console.warn(`No failure handler found for job ${job.data.queueType}`);
      }
    } else {
      console.warn(`No handlers found for queue ${job.queueName}`);
    }
    // }
  }

  async registerHandler(
    queueName: string,
    queueType: string,
    handlers: QueueHandler,
  ) {
    if (!this.handlers.has(queueName)) {
      this.handlers.set(queueName, new Map());
    }
    this.handlers.get(queueName).set(queueType, handlers);

    this.createQueue(queueName);
  }

  async process(job: Job): Promise<any> {
    const queueHandlers = this.handlers.get(job.queueName);
    if (queueHandlers) {
      const handler = queueHandlers.get(job.data.queueType);
      if (handler) {
        console.log(
          `Processing ${job.queueName} Job ${job.id}. Attempts ${job.attemptsMade}`,
        );
        return await handler.jobHandler(job);
      } else {
        console.error(`No handler found for job ${job.name}`);
      }
    } else {
      console.error(`No handlers found for queue ${job.queueName}`);
    }
  }

  createQueue(queueName: string): Queue {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName);
    }

    const queue = new Queue(queueName);
    this.queues.set(queueName, queue);

    // Create a worker for the new queue
    new Worker(queueName, this.process.bind(this), {
      connection: {
        host: this.redisHost,
        port: this.redisPort,
      },
    }).on('failed', this.onFailed.bind(this));

    return queue;
  }

  /**
   * Adds a job to the queue
   * @param queueName The name of the queue
   * @param jobName Name/Id of the Job. **Note:** `jobName` should be unique. 2 jobs with the same name will not be added to the queue
   * @param data The data to be processed by the job
   * @param delay The delay in milliseconds before the job is processed
   */
  async addJob(
    queueName: string,
    jobName: string,
    data: any,
    delay: number = 1000, // 1 second
  ) {
    const queue = this.createQueue(queueName);
    await queue.add(jobName, data, {
      delay,
      attempts: 5,
      debounce: { id: jobName }, //can't add 2 jobs with the same id
      backoff: {
        type: 'exponential',
        delay: 10000, // 10 seconds
      },
    });
  }
}
// @Processor('GenericQueue')
// export class QueueService extends WorkerHost {
//   private handlers: Map<string, QueueHandler> = new Map();
//   constructor() {
//     super();
//   }

//   @OnWorkerEvent('failed')
//   async onFailed(job: Job, error: Error) {
//     console.error(
//       `Job ${job.id} failed with error: ${error.message}. Attempts ${job.attemptsMade}`,
//     );

//     const handler = this.handlers.get(job.data.queueType);
//     if (handler && handler.failureHandler) {
//       await handler.failureHandler(job, error);
//     } else {
//       console.warn(`No failure handler found for job ${job.name}`);
//     }
//   }

//   registerHandler(type: string, handlers: QueueHandler) {
//     this.handlers.set(type, handlers);
//   }

//   async process(job: Job): Promise<any> {
//     const handler = this.handlers.get(job.data.queueType);
//     if (handler) {
//       console.log(
//         `Processing ${job.data.queueType} Job ${job.id}. Attempts ${job.attemptsMade}`,
//       );
//       return await handler.jobHandler(job);
//     } else {
//       console.error(`No handler found for job ${job.name}`);
//     }
//   }
// }
