import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import {
  DataSource,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  QueryRunner,
  Repository,
} from 'typeorm';
import { CreateCampaignDto, ExecuteClaimDto } from './dto/campaign.dto';
import { ClaimApproach } from 'src/shared/enum/campaign.enum';
import { User } from 'src/user/entities/user.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { CreditService } from 'src/wallet/services/credit.service';
import { TxStatus } from 'src/shared/enum/status.enum';
import { SquidGameParticipant } from './entities/squidGame.participant.entity';
import { Setting } from 'src/setting/entities/setting.entity';
import { SQUID_GAME_STAGE_2 } from 'src/database/seeds/squidGameStage2.seed';
import { JackpotTx } from 'src/game/entities/jackpot-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { SQUID_GAME_REVIVAL } from 'src/database/seeds/squidGameRevival.seed';
import { SquidGameRevival } from './entities/squidGame.revival.entity';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';

enum SQUID_GAME_STAGE_2_STATUS {
  SQUID_GAME_STAGE_1_NOT_SUCCESS = 'SQUID_GAME_STAGE_1_NOT_SUCCESS',
  SQUID_GAME_STAGE_2_IN_PROGRESS = 'SQUID_GAME_STAGE_2_IN_PROGRESS',
  TICKET_ELIGIBLE_STAGE_2_SUCCESS = 'TICKET_ELIGIBLE_STAGE_2_SUCCESS',
  TICKET_NOT_ELIGIBLE_STAGE_2_SUCCESS = 'TICKET_NOT_ELIGIBLE_STAGE_2_SUCCESS',
}

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
    private datasource: DataSource,
    private creditService: CreditService,
    @InjectRepository(SquidGameParticipant)
    private squidGameParticipantRepository: Repository<SquidGameParticipant>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    @InjectRepository(JackpotTx)
    private jackpotTxRepository: Repository<JackpotTx>,
    private configService: ConfigService,
    private adminNotificationService: AdminNotificationService,
    @InjectRepository(SquidGameRevival)
    private squidGameRevivalRepository: Repository<SquidGameRevival>,
  ) {}

  async createCampaign(payload: CreateCampaignDto): Promise<any> {
    try {
      const campaign = new Campaign();
      campaign.name = payload.name;
      campaign.description = payload.description;
      campaign.rewardPerUser = payload.rewardPerUser;
      campaign.banner = payload.banner;
      campaign.startTime = new Date(+payload.startTime).getTime();
      campaign.endTime = new Date(+payload.endTime).getTime();
      campaign.maxNumberOfClaims = +payload.maxUsers;
      campaign.claimApproach = payload.claimApproach;

      const validationParams = {};
      if (payload.referralCode && payload.referralCode !== '') {
        validationParams['referralCode'] = payload.referralCode;
      }
      if (payload.ignoredReferralCodes && payload.ignoredReferralCodes !== '') {
        validationParams['ignoredReferralCodes'] =
          payload.ignoredReferralCodes.split(',');
      }
      if (Object.keys(validationParams).length > 0) {
        campaign.validationParams = JSON.stringify(validationParams);
      }

      await this.campaignRepository.save(campaign);

      return;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Failed to create campaign');
    }
  }

  async findAll(page: number = 1, limit: number = 10) {
    const campaigns = await this.campaignRepository.findAndCount({
      select: [
        'id',
        'name',
        'description',
        'rewardPerUser',
        'banner',
        'startTime',
        'endTime',
      ],
      take: limit,
      skip: limit * (page - 1),
    });

    return {
      data: campaigns[0],
      currentPage: page,
      totalPages: Math.ceil(campaigns[1] / limit),
    };
  }

  async findActiveCampaignsByClaimApproach(claimApproach: ClaimApproach) {
    try {
      const activeCampaigns = await this.campaignRepository
        .createQueryBuilder('campaign')
        .leftJoinAndSelect('campaign.creditWalletTx', 'creditWalletTx')
        .where('campaign.claimApproach = :claimApproach', { claimApproach })
        .andWhere('campaign.startTime < :currentTime', {
          currentTime: new Date().getTime() / 1000,
        })
        .andWhere('campaign.endTime > :currentTime', {
          currentTime: new Date().getTime() / 1000,
        })
        .getMany();

      return activeCampaigns;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Failed to fetch active campaigns');
    }
  }

  async manualExecuteClaim(params: ExecuteClaimDto) {
    const queryRunner = this.datasource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const creditWalletTx = await this.executeClaim(
        params.claimApproach,
        params.userId,
        queryRunner,
      );

      if (creditWalletTx) {
        await queryRunner.commitTransaction();

        await this.creditService.addToQueue(creditWalletTx.id);
      } else {
        throw new BadRequestException(
          'Claim not executed. Might have claimed already',
        );
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('failed to execute claim', error.stack);

      throw new BadRequestException('Failed to execute claim');
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  // IF this method is modified in future, please check and update the manualExecuteClaim() method too
  async executeClaim(
    claimApproach: ClaimApproach,
    userId: number,
    queryRunner: QueryRunner,
  ): Promise<CreditWalletTx> {
    try {
      const userInfo = await queryRunner.manager.findOne(User, {
        where: { id: userId },
        relations: ['wallet', 'referralUser'],
      });
      if (!userInfo) return;

      const campaigns =
        await this.findActiveCampaignsByClaimApproach(claimApproach);

      switch (claimApproach) {
        case ClaimApproach.SIGNUP:
          return await this.claimSignupCampaign(
            userInfo,
            campaigns,
            queryRunner,
          );
        default:
          return;
      }
    } catch (error) {
      throw new Error(error.message);
    }
  }

  private async claimSignupCampaign(
    userInfo: User,
    activeCampaigns: Campaign[],
    runner?: QueryRunner,
  ) {
    const queryRunner = runner || this.datasource.createQueryRunner();
    try {
      if (!runner) {
        await queryRunner.connect();
        await queryRunner.startTransaction();
      }

      //exclude default signup bonus campaign
      const campaigns = activeCampaigns.filter(
        (c) => c.name !== 'Signup Bonus',
      );

      let creditTx: CreditWalletTx;
      let hasUsedCampaignReferralKey = false;
      for (const campaign of campaigns) {
        const hasUserClaimed = campaign.creditWalletTx.some(
          (tx) =>
            tx.walletId === userInfo.wallet.id && tx.campaignId === campaign.id,
        );

        if (hasUserClaimed) continue;

        if (campaign.validationParams) {
          const validations = JSON.parse(campaign.validationParams);
          const referralCode = validations.referralCode;

          const referrer = await queryRunner.manager.findOne(User, {
            where: { referralCode },
          });

          if (!referrer) {
            continue;
          }

          //user doesn't have any referrers
          if (!userInfo.referralUserId) {
            continue;
          }

          // user doesn't use the campaign referral key
          if (userInfo.referralUser && userInfo.referralUserId != referrer.id) {
            continue;
          }
        }

        //passed all validation at this point, so user could have participated in this campaign
        //unless the campaign has reached its max number of claims
        hasUsedCampaignReferralKey = true;

        if (!this.validateMaxClaims(campaign)) {
          continue;
        }

        creditTx = await this.creditService.addCreditQueryRunner(
          {
            amount: campaign.rewardPerUser,
            walletAddress: userInfo.wallet.walletAddress,
            note: campaign.name,
          },
          queryRunner,
          false,
        );

        campaign.creditWalletTx.push(creditTx);
        await queryRunner.manager.save(campaign);
      }

      if (!creditTx && !hasUsedCampaignReferralKey) {
        //not participated in any KOL campaign, add default signup bonus
        creditTx = await this.handleDefaultSignupBonus(
          userInfo,
          activeCampaigns,
          queryRunner,
        );
      }

      if (!runner) await queryRunner.commitTransaction();

      return creditTx;
    } catch (error) {
      if (!runner) await queryRunner.rollbackTransaction();

      throw new Error('Failed to claim signup bonus');
    } finally {
      if (!runner && !queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handleDefaultSignupBonus(
    userInfo: User,
    activeCampaigns: Campaign[],
    queryRunner: QueryRunner,
  ) {
    try {
      const defaultCampaign = activeCampaigns.find(
        (c) => c.name === 'Signup Bonus',
      );

      if (!defaultCampaign) return;
      if (!this.validateMaxClaims(defaultCampaign)) {
        return;
      }
      const hasUserClaimed = defaultCampaign.creditWalletTx.some(
        (tx) =>
          tx.walletId === userInfo.wallet.id &&
          tx.campaignId === defaultCampaign.id,
      );

      if (hasUserClaimed) return;
      const referralUserId = userInfo.referralUserId;

      if (defaultCampaign.validationParams && referralUserId) {
        const validations = JSON.parse(defaultCampaign.validationParams);
        const ignoredReferrers = validations.ignoredReferralCodes;

        const referrer = await queryRunner.manager.findOne(User, {
          where: { id: referralUserId },
        });

        if (
          ignoredReferrers &&
          ignoredReferrers.length > 0 &&
          ignoredReferrers.includes(referrer.referralCode)
        ) {
          return;
        }
      }

      const creditTx = await this.creditService.addCreditQueryRunner(
        {
          amount: defaultCampaign.rewardPerUser,
          walletAddress: userInfo.wallet.walletAddress,
          note: defaultCampaign.name,
        },
        queryRunner,
        false,
      );

      defaultCampaign.creditWalletTx.push(creditTx);
      await queryRunner.manager.save(defaultCampaign);

      return creditTx;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Failed to claim default signup bonus');
    }
  }

  private validateMaxClaims(campaign: Campaign): boolean {
    const successfulClaims = campaign.creditWalletTx.filter(
      (tx) => tx.status === TxStatus.SUCCESS,
    );

    return successfulClaims.length <= campaign.maxNumberOfClaims;
  }

  async findActiveCampaigns() {
    const currentTime = new Date().getTime() / 1000;

    const campaigns = await this.campaignRepository.find({
      where: {
        startTime: LessThanOrEqual(currentTime),
        endTime: MoreThanOrEqual(currentTime),
      },
    });

    return campaigns;
  }

  async findActiveWithBannerCampaigns() {
    const currentTime = new Date().getTime() / 1000;

    const campaigns = await this.campaignRepository.find({
      where: {
        startTime: LessThanOrEqual(currentTime),
        endTime: MoreThanOrEqual(currentTime),
        banner: Not(IsNull()),
      },
    });

    return campaigns;
  }

  async getSquidGameParticipant(userId: number): Promise<SquidGameParticipant> {
    return await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.userId = :userId', { userId })
      .getOne();
  }

  async getSquidGameData() {
    const [, stage1ParticipantCount] = await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.lastStage = 1')
      .getManyAndCount();

    const [, stage2ParticipantCount] = await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.lastStage = 2')
      .getManyAndCount();

    const [, stage3ParticipantCount] = await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.lastStage = 3')
      .getManyAndCount();

    const [, stage4ParticipantCount] = await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.lastStage = 4')
      .getManyAndCount();

    const stage1Revival = await this.settingRepository
      .createQueryBuilder('setting')
      .where('setting.key = :key', { key: 'SQUID_GAME_REVIVAL_STAGE_1' })
      .getOne();
    const stage1RevivalData = stage1Revival
      ? (JSON.parse(stage1Revival.value) as SQUID_GAME_REVIVAL)
      : null;

    const stage2Revival = await this.settingRepository
      .createQueryBuilder('setting')
      .where('setting.key = :key', { key: 'SQUID_GAME_REVIVAL_STAGE_2' })
      .getOne();
    const stage2RevivalData = stage2Revival
      ? (JSON.parse(stage2Revival.value) as SQUID_GAME_REVIVAL)
      : null;

    const stage3Revival = await this.settingRepository
      .createQueryBuilder('setting')
      .where('setting.key = :key', { key: 'SQUID_GAME_REVIVAL_STAGE_3' })
      .getOne();
    const stage3RevivalData = stage3Revival
      ? (JSON.parse(stage3Revival.value) as SQUID_GAME_REVIVAL)
      : null;

    return {
      stage1ParticipantCount,
      stage2ParticipantCount,
      stage3ParticipantCount,
      stage4ParticipantCount,
      stage1RevivalData,
      stage2RevivalData,
      stage3RevivalData,
    };
  }

  async getSquidGameRevivalStage(): Promise<number | null> {
    const currentTime = new Date(Date.now());

    for (let stage = 1; stage <= 3; stage++) {
      const squidGameRevivalStage = await this.settingRepository
        .createQueryBuilder('setting')
        .where('setting.key = :key', {
          key: `SQUID_GAME_REVIVAL_STAGE_${stage}`,
        })
        .getOne();

      if (squidGameRevivalStage) {
        const squidGameRevivalStageData = JSON.parse(
          squidGameRevivalStage.value,
        ) as SQUID_GAME_REVIVAL;
        if (
          new Date(squidGameRevivalStageData.startTime) <= currentTime &&
          new Date(squidGameRevivalStageData.endTime) >= currentTime
        ) {
          return stage;
        }
      }
    }

    // no active revival stage found
    return null;
  }

  async getUserSquidGameStage2Ticket(
    userId: number,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [jackpotTxs, totalCount] = await this.jackpotTxRepository
      .createQueryBuilder('jackpotTx')
      .leftJoinAndSelect('jackpotTx.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .leftJoinAndSelect('jackpotTx.jackpot', 'jackpot')
      .where('user.id = :userId', { userId })
      .andWhere('jackpotTx.status = :status', { status: TxStatus.SUCCESS })
      .andWhere('jackpot.id = :jackpotId', { jackpotId: 1 })
      .orderBy('jackpotTx.id', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const setting = await this.settingRepository
      .createQueryBuilder('setting')
      .where('setting.key = :key', { key: 'ENABLE_SQUID_GAME_STAGE_2' })
      .getOne();
    const squidGameStage2Setting = JSON.parse(
      setting.value,
    ) as SQUID_GAME_STAGE_2;

    let squidGameStage2Status: any = null;

    const participant = await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.userId = :userId', { userId })
      .getOne();

    if (!participant) {
      squidGameStage2Status =
        SQUID_GAME_STAGE_2_STATUS.SQUID_GAME_STAGE_1_NOT_SUCCESS;
    } else {
      if (!squidGameStage2Setting.participantIsUpdated) {
        squidGameStage2Status =
          SQUID_GAME_STAGE_2_STATUS.SQUID_GAME_STAGE_2_IN_PROGRESS;
      }
    }

    return {
      data: jackpotTxs.map((jackpotTx) => {
        return {
          id: jackpotTx.id,
          hashGenerated: jackpotTx.randomHash,
          createdTime: jackpotTx.createdDate,
          explorerUrl: `${this.configService.get(
            `BLOCK_EXPLORER_URL_${this.configService.get('BASE_CHAIN_ID')}`,
          )}/tx/${jackpotTx.txHash}`,
          squidGameStage2Status: squidGameStage2Status
            ? squidGameStage2Status
            : jackpotTx.randomHash.endsWith(squidGameStage2Setting.seedChar)
              ? SQUID_GAME_STAGE_2_STATUS.TICKET_ELIGIBLE_STAGE_2_SUCCESS
              : SQUID_GAME_STAGE_2_STATUS.TICKET_NOT_ELIGIBLE_STAGE_2_SUCCESS,
        };
      }),
      totalCount,
      currentPage: page,
    };
  }

  async squidGameRevival(
    userId: number,
    amount: number,
    queryRunner: QueryRunner,
  ) {
    await this._squidGameRevival(userId, amount, false, queryRunner);

    // revival for referral user if any
    const user = await queryRunner.manager
      .createQueryBuilder(User, 'user')
      .where('user.id = :userId', { userId })
      .getOne();
    if (user.referralUserId) {
      await this._squidGameRevival(
        user.referralUserId,
        amount,
        true,
        queryRunner,
      );
    }
  }

  private async _squidGameRevival(
    userId: number,
    amount: number,
    isReferral: boolean,
    queryRunner: QueryRunner,
  ) {
    await queryRunner.startTransaction();

    try {
      const currentRevivalStage = await this.getSquidGameRevivalStage();
      const squidGameData = await this.getSquidGameData();

      if (!currentRevivalStage) {
        // revival stage not in progress
        return;
      }

      // get participant record(might not exist)
      const participant = await queryRunner.manager
        .createQueryBuilder(SquidGameParticipant, 'participant')
        .where('participant.userId = :userId', { userId })
        .getOne();
      if (participant && participant.lastStage === currentRevivalStage) {
        // participant already in current stage, no need to revive
        return;
      }

      // create new revival record
      const squidGameRevival = new SquidGameRevival();
      squidGameRevival.userId = userId;
      squidGameRevival.stageNumber = currentRevivalStage;
      isReferral
        ? (squidGameRevival.amountReferred = amount)
        : (squidGameRevival.amountPaid = amount);
      await queryRunner.manager.save(squidGameRevival);

      // get all revival records for particular user
      const squidGameRevivals = await queryRunner.manager
        .createQueryBuilder(SquidGameRevival, 'revival')
        .where('revival.userId = :userId', { userId })
        .getMany();
      // calculate total amount deposited + amount referred
      const totalAmountPaid = squidGameRevivals.reduce(
        (total, revival) => total + revival.amountPaid + revival.amountReferred,
        0,
      );

      // check if user meet criteria for next/latest stage
      let userStageToUpdate = 0;
      const stage1Amount = squidGameData.stage1RevivalData
        ? squidGameData.stage1RevivalData.amountRequired
        : 0;
      const stage2Amount = squidGameData.stage2RevivalData
        ? squidGameData.stage2RevivalData.amountRequired
        : 0;
      const stage3Amount = squidGameData.stage3RevivalData
        ? squidGameData.stage3RevivalData.amountRequired
        : 0;

      // User can progress up to the current revival stage
      if (currentRevivalStage === 3) {
        if (totalAmountPaid >= stage1Amount + stage2Amount + stage3Amount) {
          userStageToUpdate = 3;
        } else if (totalAmountPaid >= stage1Amount + stage2Amount) {
          userStageToUpdate = 2;
        } else if (totalAmountPaid >= stage1Amount) {
          userStageToUpdate = 1;
        }
      } else if (currentRevivalStage === 2) {
        if (totalAmountPaid >= stage1Amount + stage2Amount) {
          userStageToUpdate = 2;
        } else if (totalAmountPaid >= stage1Amount) {
          userStageToUpdate = 1;
        }
      } else if (currentRevivalStage === 1 && totalAmountPaid >= stage1Amount) {
        userStageToUpdate = 1;
      }

      if (userStageToUpdate === 0) {
        // user not meet criteria for any stage
        return;
      }

      if (!participant) {
        // user never participate in squid game, need to create new participant record
        const newParticipant = new SquidGameParticipant();
        newParticipant.userId = userId;
        newParticipant.lastStage = userStageToUpdate;
        newParticipant.participantStatus = `SQUID_GAME_STAGE_${currentRevivalStage.toString()}_REVIVED`;
        await queryRunner.manager.save(newParticipant);
      } else {
        // update lastStage of existing participant record
        participant.lastStage = userStageToUpdate;
        participant.participantStatus = `SQUID_GAME_STAGE_${currentRevivalStage.toString()}_REVIVED`;
        await queryRunner.manager.save(participant);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(error);
      // inform admin
      await this.adminNotificationService.setAdminNotification(
        `campaign.service.squidGameRevival: Failed to revive squid game for user ${userId}`,
        'SQUID_GAME_REVIVAL_FAILED',
        'Failed to revive squid game',
        true,
        true,
      );
    }
    // queryRunner will be released by the parent function
  }

  async getSquidGameParticipantRevivalData(userId: number): Promise<{
    amountRequiredToCurrentStage: number;
  }> {
    const currentRevivalStage = await this.getSquidGameRevivalStage();
    const squidGameData = await this.getSquidGameData();

    if (!currentRevivalStage) {
      return {
        amountRequiredToCurrentStage: 0,
      };
    }

    const participant = await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.userId = :userId', { userId })
      .getOne();

    if (participant && participant.lastStage === currentRevivalStage) {
      return {
        amountRequiredToCurrentStage: 0,
      };
    }

    const squidGameRevival = await this.squidGameRevivalRepository
      .createQueryBuilder('revival')
      .where('revival.userId = :userId', { userId })
      .getMany();
    const totalAmount = squidGameRevival.reduce(
      (total, revival) => total + revival.amountPaid + revival.amountReferred,
      0,
    );

    let amountRequiredToLatestStage = 0;
    if (currentRevivalStage === 1) {
      amountRequiredToLatestStage =
        squidGameData.stage1RevivalData.amountRequired - totalAmount;
    } else if (currentRevivalStage === 2) {
      amountRequiredToLatestStage =
        squidGameData.stage1RevivalData.amountRequired +
        squidGameData.stage2RevivalData.amountRequired -
        totalAmount;
    } else if (currentRevivalStage === 3) {
      amountRequiredToLatestStage =
        squidGameData.stage1RevivalData.amountRequired +
        squidGameData.stage2RevivalData.amountRequired +
        squidGameData.stage3RevivalData.amountRequired -
        totalAmount;
    }

    return {
      amountRequiredToCurrentStage: amountRequiredToLatestStage,
    };
  }
}
