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

  @Cron('0 2 */1 * * *') // 2 minutes after every hour
  // async emitDrawResult(@MessageBody() data: unknown): Promise<WsResponse<unknown>> { // TODO: see below
  async emitDrawResult() {
    this.logger.log('emitDrawResult()');
    try {
      // get draw result from last hour game
      const lastHour = new Date(Date.now() - 60 * 60 * 1000);
      const lastHourUTC = new Date(
        lastHour.getUTCFullYear(),
        lastHour.getUTCMonth(),
        lastHour.getUTCDate(),
        lastHour.getUTCHours(),
        lastHour.getUTCMinutes(),
        lastHour.getUTCSeconds(),
      );
      const lastGame = await this.gameRepository
        .createQueryBuilder('game')
        .leftJoinAndSelect('game.drawResult', 'drawResult')
        .where('game.startDate < :lastHourUTC', { lastHourUTC })
        .andWhere('game.endDate > :lastHourUTC', { lastHourUTC })
        .getOne();
      let drawResults = lastGame.drawResult;

      // fallback method if drawResults.length === 0 for some reason i.e. set draw result bot/server down
      if (drawResults.length === 0) {
        drawResults = await this.gameService.setFallbackDrawResults(
          lastGame.id,
        );

        // inform admin
        await this.adminNotificationService.setAdminNotification(
          'game.gateway.emitDrawResult: drawResults.length === 0',
          'NO_DRAW_RESULT_FOUND',
          'No draw result record found in last game',
          true,
          true,
        );
      }

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
      let attempts = 0;
      while (true) {
        if (attempts === 5) {
          // failed for 5 times, inform admin
          await this.adminNotificationService.setAdminNotification(
            'Submit draw result on-chain tx had failed for 5 times',
            'SUBMIT_DRAW_RESULT_FAILED_5_TIMES',
            'Submit draw result failed 5 times',
            true,
            true,
          );
          return;
        }
        try {
          await this.gameService.submitDrawResult(drawResults, lastGame.id);
          // no error, success
          break;
        } catch (error) {
          // error occur, log and retry
          this.logger.error(error);
          attempts++;
        }
      }

      await this.gameService.setAvailableClaimAndProcessReferralBonus(
        drawResults,
        lastGame.id,
      );
    } catch (err) {
      console.log(err);
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
