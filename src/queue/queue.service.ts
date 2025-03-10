import { INestApplication, Injectable, Logger } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { ConfigService } from 'src/config/config.service';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

interface QueueHandler {
  jobHandler: (job: Job) => Promise<any>;
  failureHandler?: (job: Job, error: Error) => Promise<any>;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  private handlers: Map<string, Map<string, QueueHandler>> = new Map();
  private queues: Map<string, Queue> = new Map();
  private redisHost: string;
  private redisPort: number;
  private workers: Map<string, Worker> = new Map(); // Track active workers by queue name
  private maxWorkers = 10; // Number of workers in the pool
  private waitingQueue: Array<{ queueName: string; jobData: any }> = []; // Track waiting jobs

  private bullBoardServer: any;
  private addQueue: (adapter: BullMQAdapter) => void;

  constructor(private readonly configService: ConfigService) {
    this.redisHost = this.configService.get('REDIS_HOST');
    this.redisPort = +this.configService.get('REDIS_PORT');
  }

  // Accept the Nest app instance after bootstrap
  setAppInstance(app: INestApplication) {
    this.setupBullBoard(app);
  }

  /**
   * Set up Bull Board to monitor queues
   */
  private setupBullBoard(app: INestApplication) {
    this.bullBoardServer = new ExpressAdapter();
    this.bullBoardServer.setBasePath('/redis-admin/queues');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const bullBoard = createBullBoard({
      queues: Array.from(this.queues.values()).map(
        (queue) => new BullMQAdapter(queue),
      ),
      serverAdapter: this.bullBoardServer,
    });

    // Extract the addQueue method for dynamic queue registration
    this.addQueue = bullBoard.addQueue;

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use('/redis-admin/queues', (req, res, next) => {
      const auth = {
        login: process.env.BULL_ADMIN_USERNAME,
        password: process.env.BULL_ADMIN_PASSWORD,
      };
      const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
      const [login, password] = Buffer.from(b64auth, 'base64')
        .toString()
        .split(':');

      // Check credentials
      if (
        login &&
        password &&
        login === auth.login &&
        password === auth.password
      ) {
        return next();
      }

      // Request authentication
      res.set('WWW-Authenticate', 'Basic realm="401"');
      res.status(401).send('Authentication required.');
    });
    expressApp.use('/redis-admin/queues', this.bullBoardServer.getRouter());
    this.logger.log('Bull Board is available at /redis-admin/queues');
  }

  async onFailed(job: Job, error: Error) {
    this.logger.error(
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
          this.logger.error(error);
        }
      } else {
        console.warn(`No failure handler found for job ${job.data.queueType}`);
      }
    } else {
      console.warn(`No handlers found for queue ${job.queueName}`);
    }
  }

  async registerHandler(
    queueName: QueueName,
    queueType: QueueType,
    handlers: QueueHandler,
  ) {
    if (!this.handlers.has(queueName)) {
      this.handlers.set(queueName, new Map());
    }
    this.handlers.get(queueName).set(queueType, handlers);
  }

  async process(job: Job): Promise<any> {
    const queueHandlers = this.handlers.get(job.queueName);
    if (queueHandlers) {
      const handler = queueHandlers.get(job.data.queueType);
      if (handler) {
        this.logger.log(
          `Processing ${job.queueName} - ${job.data.queueType} Job ${job.id}. Attempts ${job.attemptsMade}`,
        );
        return await handler.jobHandler(job);
      } else {
        this.logger.error(`No handler found for job ${job.name}`);
      }
    } else {
      this.logger.error(`No handlers found for queue ${job.queueName}`);
    }
  }

  createQueue(queueName: string): Queue {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName);
    }

    const queue = new Queue(queueName, {
      connection: {
        host: this.redisHost,
        port: this.redisPort,
      },
    });
    this.queues.set(queueName, queue);

    // Dynamically add new queues to Bull Board
    if (this.addQueue) {
      const adapter = new BullMQAdapter(queue);
      this.addQueue(adapter);
      this.logger.log(`Queue ${queueName} registered in Bull Board.`);
    }
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
    delay: number = 0, // no delay
    attempts: number = 5,
  ) {
    const queue = this.createQueue(queueName);
    await queue.add(jobName, data, {
      delay,
      attempts,
      debounce: { id: jobName }, //can't add 2 jobs with the same id
      backoff: {
        type: 'exponential',
        delay: 5000, // 5 seconds
      },
    });

    this.assignWorkerToQueue(queueName, data);
  }

  /**
   * Adds a job to the queue
   * @param queueName The name of the queue
   * @param jobName Name/Id of the Job. **Note:** `jobName` should be unique. 2 jobs with the same name will not be added to the queue
   * @param handlers The handler functions for the job
   * @param data The data to be processed by the job
   * @param delay The delay in milliseconds before the job is processed
   */
  async addDynamicQueueJob(
    queueName: string,
    jobName: string,
    handlers: QueueHandler,
    data: any,
    delay: number = 0, // no delay by default
    attempts: number = 5,
  ) {
    const queue = this.createQueue(queueName);

    // Register the handler
    if (!this.handlers.has(queueName)) {
      this.handlers.set(queueName, new Map());
    }
    this.handlers.get(queueName).set(data.queueType, handlers);

    // Add the job to the queue
    await queue.add(jobName, data, {
      delay,
      attempts,
      debounce: { id: jobName }, //can't add 2 jobs with the same id
      backoff: {
        type: 'exponential',
        delay: 5000, // 5 seconds
      },
      removeOnComplete: true,
    });

    this.assignWorkerToQueue(queueName, data);
  }

  // Dynamically assign a worker to process jobs in a specific queue (wallet or fixed)
  private assignWorkerToQueue(queueName: string, jobData: any) {
    // If a worker is already assigned to this queue, do nothing
    if (this.workers.has(queueName)) {
      return;
    }

    // If max workers limit is reached, add the job to the waiting queue
    if (this.workers.size >= this.maxWorkers) {
      this.logger.warn(
        `Max worker limit reached, queuing job for: ${queueName}`,
      );
      this.waitingQueue.push({ queueName, jobData });
      return;
    }

    // Create and assign a worker to this queue
    const worker = new Worker(queueName, this.process.bind(this), {
      connection: {
        host: this.redisHost,
        port: this.redisPort,
      },
    });

    worker.on('failed', this.onFailed.bind(this));

    worker.on('completed', async () => {
      this.logger.log(`Job completed for queue ${queueName}`);
      // Optionally remove the worker when the queue is empty
      await this.removeWorkerIfQueueIsEmpty(queueName);
      // Check the waiting queue for the next job to assign
      this.assignNextJobFromWaitingQueue();
    });

    this.workers.set(queueName, worker);
    this.logger.log(`Assigned worker to queue: ${queueName}`);
  }

  // Check if there are any jobs in the waiting queue and assign them if a worker becomes free
  private assignNextJobFromWaitingQueue() {
    // Check if there are jobs in the waiting queue and workers are available
    if (this.waitingQueue.length > 0 && this.workers.size < this.maxWorkers) {
      const nextJob = this.waitingQueue.shift(); // Get the next job from the waiting queue
      if (nextJob) {
        this.assignWorkerToQueue(nextJob.queueName, nextJob.jobData);
      }
    }
  }

  // Remove the worker if the queue is empty
  private async removeWorkerIfQueueIsEmpty(queueName: string) {
    const queue = this.queues.get(queueName);

    const jobCounts = await queue.getJobCounts();
    if (
      jobCounts.waiting === 0 &&
      jobCounts.active === 0 &&
      jobCounts.delayed === 0
    ) {
      const worker = this.workers.get(queueName);
      worker.close();
      this.workers.delete(queueName);
      this.logger.log(
        `Removed worker for queue: ${queueName} as the queue is empty`,
      );
    }
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
//     this.logger.error(
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
//       this.logger.error(`No handler found for job ${job.name}`);
//     }
//   }
// }
