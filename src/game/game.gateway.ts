import { InjectRepository } from '@nestjs/typeorm';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Game } from './entities/game.entity';
import { Brackets, DataSource, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { GameService } from './game.service';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { QueueService } from 'src/queue/queue.service';
import { Logger } from '@nestjs/common';
import { BetOrder } from './entities/bet-order.entity';
import { TxStatus } from 'src/shared/enum/status.enum';
import { FCMService } from 'src/shared/services/fcm.service';

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
    private dataSource: DataSource,
    private fcmService: FCMService,
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
    let lastGame: Game;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
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
      lastGame = await queryRunner.manager
        .createQueryBuilder(Game, 'game')
        .leftJoinAndSelect('game.drawResult', 'drawResult')
        .where('game.startDate < :lastHourUTC', { lastHourUTC })
        .andWhere('game.endDate > :lastHourUTC', { lastHourUTC })
        .getOne();

      this.logger.log(`lastGame: ${JSON.stringify(lastGame)}`);
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
          this.logger.log('submitDrawResult is starting');

          await this.gameService.submitDrawResult(drawResults, lastGame.id);
          // no error, success
          break;
        } catch (error) {
          // error occur, log and retry
          console.log(error);
          attempts++;
        }
      }

      this.logger.log('Draw result submitted to Core contract');
      await queryRunner.commitTransaction();

      this.logger.log('setAvailableClaimAndProcessReferralBonus is starting');
      await this.gameService.setAvailableClaimAndProcessReferralBonus(
        drawResults,
        lastGame.id,
        queryRunner,
      );
      this.logger.log('setAvailableClaimAndProcessReferralBonus ended');
    } catch (err) {
      console.log(err);
      this.logger.error(err);
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error occur in game.gateway.emitDrawResult, error: ${err}`,
        'ExecutionError',
        'Execution Error in emitDrawResult()',
        true,
        true,
      );
    } finally {
      await queryRunner.release();
    }

    if (lastGame) {
      const notifiedUsers = new Set<number>();
      const epoch = lastGame.epoch;

      try {
        const notificationbetOrders = await this.dataSource.manager
          .createQueryBuilder(BetOrder, 'betOrder')
          .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
          .leftJoinAndSelect('betOrder.creditWalletTx', 'creditWalletTx')
          .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
          .leftJoinAndSelect('creditWalletTx.userWallet', 'creditUserWallet')
          .leftJoinAndSelect('userWallet.user', 'user')
          .leftJoinAndSelect('creditUserWallet.user', 'creditUser')
          .where('betOrder.gameId = :gameId', { gameId: lastGame.id })
          .andWhere(
            new Brackets((qb) => {
              qb.where('walletTx.status = :status', {
                status: TxStatus.SUCCESS,
              }).orWhere('creditWalletTx.status = :status', {
                status: TxStatus.SUCCESS,
              });
            }),
          )
          .getMany();

        this.logger.log('Bet orders to notify:', notificationbetOrders.length);

        // notify user
        const userBetOrdersMap = new Map<number, BetOrder[]>();

        for (const betOrder of notificationbetOrders) {
          const user =
            betOrder.walletTx?.userWallet?.user ||
            betOrder.creditWalletTx?.userWallet?.user;
          if (!user) {
            this.logger.log(`BetOrder ID: ${betOrder.id} has no user`);
            continue;
          }

          if (!userBetOrdersMap.has(user.id)) {
            userBetOrdersMap.set(user.id, []);
          }
          userBetOrdersMap.get(user.id).push(betOrder);
        }

        for (const [userId, betOrders] of userBetOrdersMap.entries()) {
          let isWinner = false;
          let winningNumberPair = '';

          for (const betOrder of betOrders) {
            const bigForecast = betOrder.bigForecastAmount;
            const smallForecast = betOrder.smallForecastAmount;

            for (const drawResult of lastGame.drawResult) {
              const prizeCategory = drawResult.prizeCategory;
              if (betOrder.numberPair === drawResult.numberPair) {
                if (
                  bigForecast > 0 ||
                  (smallForecast > 0 && ['1', '2', '3'].includes(prizeCategory))
                ) {
                  isWinner = true;
                  winningNumberPair = drawResult.numberPair;
                  break;
                }
              }
            }

            if (isWinner) break;
          }

          const title = isWinner ? '✨ You’re a Winner! ✨' : '📢 Game Results';
          const message = isWinner
            ? `✨ You’re a Winner! ✨\n\n🎉 Amazing! You’ve just won the game!\n\n**Game Epoch:** ${epoch}\n**Winning Number:** ${winningNumberPair}\n\n🍀 Luck is on your side—why not try your luck again?`
            : `🧧 Better Luck Next Time! 🧧\n\nThe results are in, but luck wasn’t on your side this time.\n\n**Game Epoch:** ${epoch}\n\n🎯 Take another shot—your lucky day could be just around the corner!`;

          await this.fcmService.sendUserFirebase_TelegramNotification(
            userId,
            title,
            message,
          );

          this.logger.log(
            `Notification sent to user ID: ${userId}, Status: ${
              isWinner ? 'WINNER' : 'LOSER'
            }`,
          );

          await this.delay(200);
        }
      } catch (ex) {
        console.log('Error in drawResult sending notification', ex);
      }
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
