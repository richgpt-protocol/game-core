import { InjectRepository } from '@nestjs/typeorm';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Game } from './entities/game.entity';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { GameService } from './game.service';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { QueueService } from 'src/queue/queue.service';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway {
  private readonly logger = new Logger(GameGateway.name);

  delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    private gameService: GameService,
    private cacheSettingService: CacheSettingService,
    private adminNotificationService: AdminNotificationService,
    private readonly queueService: QueueService,
  ) {}

  @SubscribeMessage('liveDrawResult')
  async handleLiveDrawResult() {
    const currentResult = this.cacheSettingService.getAll();
    // return empty array if not in live results period
    return (
      Object.keys(currentResult)
        .map((key) => {
          return {
            id: Number(key),
            prizeCategory: currentResult[key].prizeCategory,
            numberPair: currentResult[key].numberPair,
            gameId: currentResult[key].gameId,
          };
        })
        // id is drawResult.id, drawResult record created from first prize to consolation prize,
        // hence sort result descending to return array where index start from consolation prize
        .sort((a, b) => b.id - a.id)
    );
  }

  // @Cron('0 2 */1 * * *') // 2 minutes after every hour
  // async emitDrawResult(@MessageBody() data: unknown): Promise<WsResponse<unknown>> { // TODO: see below
  async emitDrawResult() {
    this.logger.log('emitDrawResult()');
    try {
      // get draw result from last game
      const lastGame = await this.gameRepository.findOne({
        where: { isClosed: true },
        order: { id: 'DESC' },
        relations: { drawResult: true },
      });
      const drawResults = lastGame.drawResult;
      // current drawResults is in sequence(first, second...)
      // loop through drawResults in reverse order(consolation, special...) and emit to client
      for (let i = drawResults.length - 1; i >= 0; i--) {
        // omit unnecessary fields to reduce payload size
        const { prizeIndex, createdDate, ...result } = drawResults[i];
        // TODO: use return instead of emit, to utilize nestjs functions(i.e. interceptor)
        // return { event: 'events', data: result };
        this.server.emit('liveDrawResult', result);
        // cache draw result with id as key to determine the order of draw result
        this.cacheSettingService.set(result.id.toString(), result);
        // result emit every 2 seconds
        await this.delay(2000);
      }

      // submit draw result to Core contract
      const jobId = `submitDrawResult-${lastGame.id}`;

      console.log('emitDrawResult jobId:', jobId);
      await this.queueService.addJob(
        QueueName.GAME,
        jobId,
        {
          drawResults: drawResults,
          gameId: lastGame.id,
          queueType: QueueType.SUBMIT_DRAW_RESULT,
        },
        0, // no delay
      );
      console.log('emitDrawResult jobId:', jobId, 'submitted');
    } catch (err) {
      console.error(err);
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in game.gateway.emitDrawResult, error: ${err}`,
        'ExecutionError',
        'Execution Error in emitDrawResult()',
        true,
        true,
      );
    }
  }
}

// frontend example
// <html>
//   <head>
//     <script src="https://cdn.socket.io/4.3.2/socket.io.min.js" integrity="sha384-KAZ4DtjNhLChOB/hxXuKqhMLYvx3b5MlT55xPEiNmREKRzeEm+RVPlTnAn0ajQNs" crossorigin="anonymous"></script>
//     <script>
//       const socket = io('http://localhost:3000');
//       socket.emit('liveDrawResult', result => {
//         // results that already emitted
//         console.log(result);
//       });
//       socket.on('liveDrawResult', data => {
//         // ongoing results
//         console.log(data);
//       });
//     </script>
//   </head>

//   <body></body>
// </html>
