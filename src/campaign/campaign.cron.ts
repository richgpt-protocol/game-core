import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Setting } from 'src/setting/entities/setting.entity';
import { ConfigService } from 'src/config/config.service';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { Cron } from '@nestjs/schedule';
import { ERC20__factory } from 'src/contract';
import { ethers } from 'ethers';
import { Game } from 'src/game/entities/game.entity';
import { MPC } from 'src/shared/mpc';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import { FCMService } from 'src/shared/services/fcm.service';
import { BetOrder } from 'src/game/entities/bet-order.entity';

@Injectable()
export class CampaignCron {
  private readonly logger = new Logger(CampaignCron.name);
  constructor(
    private datasource: DataSource,
    private configService: ConfigService,
    private fcmService: FCMService,
    private adminNotificationService: AdminNotificationService,
  ) {}

  @Cron('0 5 */1 * * *') // 5 minutes after every hour
  async distributeCashbackCampaign() {
    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const cashbackSetting = await queryRunner.manager
        .createQueryBuilder(Setting, 'setting')
        .where('setting.key = :key', { key: SettingEnum.CASHBACK_CAMPAIGN })
        .getOne();
      if (cashbackSetting) {
        const cashbackSettingValue = JSON.parse(cashbackSetting.value);
        const currentTime = new Date(Date.now());
        const startTime = new Date(cashbackSettingValue.startTime);
        const endTime = new Date(cashbackSettingValue.endTime);
        if (currentTime >= startTime && currentTime <= endTime) {
          const now = new Date(Date.now());
          const lastHour = new Date(now.setHours(now.getHours() - 1));
          const lastEpoch = await queryRunner.manager
            .createQueryBuilder(Game, 'game')
            .where('game.startDate < :lastHour', { lastHour })
            .andWhere('game.endDate > :lastHour', { lastHour })
            .getOne();

          let betOrders: Array<BetOrder> = [];
          betOrders = await queryRunner.manager
            .createQueryBuilder(BetOrder, 'betOrder')
            .leftJoinAndSelect('betOrder.walletTx', 'walletTx')
            .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
            .leftJoinAndSelect('betOrder.gameUsdTx', 'gameUsdTx')
            .where('betOrder.gameId = :gameId', { gameId: lastEpoch.id })
            .andWhere('walletTx.txType = :txType', { txType: 'PLAY' })
            .andWhere('walletTx.status = :status', { status: 'S' })
            .getMany();
          // if betOrder.isMasked is true, walletTx.status will always be 'S'
          // need to check if on-chain tx success via gameUsdTx.maskingTxHash is not null
          betOrders = betOrders.filter((betOrder) => {
            if (betOrder.isMasked) {
              return betOrder.gameUsdTx.maskingTxHash !== null;
            }
            return true;
          });
          if (betOrders.length === 0) return;

          const provider = new ethers.JsonRpcProvider(
            this.configService.get(
              `PROVIDER_RPC_URL_${this.configService.get('BASE_CHAIN_ID')}`,
            ),
          );
          const cashbackDistributerAddress = this.configService.get(
            'CASHBACK_DISTRIBUTER_ADDRESS',
          );
          const token = ERC20__factory.connect(
            this.configService.get('OPBNB_USDT_TOKEN_ADDRESS'),
            new ethers.Wallet(
              await MPC.retrievePrivateKey(cashbackDistributerAddress),
              provider,
            ),
          );

          let cashbackCapPerEpoch = cashbackSettingValue.capPerEpoch as number;
          for (const betOrder of betOrders) {
            // walletTx.txAmount should only be the amount bet with USDT
            const betAmount = betOrder.walletTx.txAmount;

            let retryCount = 0;
            if (cashbackCapPerEpoch >= betAmount) {
              while (retryCount < 3) {
                try {
                  const txResponse = await token.transfer(
                    betOrder.walletTx.userWallet.walletAddress,
                    ethers.parseUnits(betAmount.toString(), 18),
                  );
                  const txReceipt = await txResponse.wait();
                  if (txReceipt.status === 1) break;
                } catch (error) {
                  this.logger.error(
                    `Error in campaign.cron.distributeCashbackCampaign: ${error}, betOrder: ${JSON.stringify(
                      betOrder,
                    )}`,
                  );
                }
                retryCount++;
              }
              if (retryCount < 3) {
                cashbackCapPerEpoch -= betAmount;

                await this.fcmService.sendUserFirebase_TelegramNotification(
                  betOrder.walletTx.userWallet.userId,
                  'Cashback Campaign',
                  `🎉 Congrats! Your cashback from last hour's bet has been sent! 💰 You have also gained ${betAmount * 1000} XP! 🚀
📢 Invite friends to join now and earn up to 20% commission in USDT on their bets! 🎁 Keep playing & win more! 🎲✨`,
                );
              }
            } else {
              await this.fcmService.sendUserFirebase_TelegramNotification(
                betOrder.walletTx.userWallet.userId,
                'Cashback Campaign',
                `😲 Almost! The last hour's cashback hit the cap, and you've missed it! ⏳ Bet early next hour before it runs out! ⏰ Here's ${betAmount * 1000} XP reward for your bet! 🎮🔥
📢 Invite friends to join now and earn up to 20% commission in USDT on their bets! 🎁 Keep playing & win more! 🎯🏆`,
              );
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in campaign.cron.distributeCashbackCampaign: ${error}`,
      );
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `Error in campaign.cron.distributeCashbackCampaign: ${error}`,
        'ERROR_IN_DISTRIBUTE_CASHBACK_CAMPAIGN',
        'Error in distribute cashback campaign',
        true,
        true,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
