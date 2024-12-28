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

    // no active revival stage found
    return null;
  }

  async getUserSquidGameStage2Ticket(
    userId: number,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const jackpotTxs = await this.jackpotTxRepository
      .createQueryBuilder('jackpotTx')
      .leftJoinAndSelect('jackpotTx.walletTx', 'walletTx')
      .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
      .leftJoinAndSelect('userWallet.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('jackpotTx.status = :status', { status: TxStatus.SUCCESS })
      .orderBy('jackpotTx.id', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    const setting = await this.settingRepository
      .createQueryBuilder('setting')
      .where('setting.key = :key', { key: 'ENABLE_SQUID_GAME_STAGE_2' })
      .getOne();
    const squidGameStage2Setting = JSON.parse(
      setting.value,
    ) as SQUID_GAME_STAGE_2;

    let squidGameStage2Status = '';

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

    return jackpotTxs.map((jackpotTx) => {
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
    });
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
      const currentTime = new Date(Date.now());
      let stage1RevivalData: SQUID_GAME_REVIVAL | null = null;
      let stage2RevivalData: SQUID_GAME_REVIVAL | null = null;
      let stage3RevivalData: SQUID_GAME_REVIVAL | null = null;

      // get participant record(might not exist)
      const participant = await queryRunner.manager
        .createQueryBuilder(SquidGameParticipant, 'participant')
        .where('participant.userId = :userId', { userId })
        .getOne();

      // stage 1 revival
      const stage1Revival = await queryRunner.manager
        .createQueryBuilder(Setting, 'setting')
        .where('setting.key = :key', {
          key: `SQUID_GAME_REVIVAL_STAGE_1`,
        })
        .getOne();
      if (stage1Revival) {
        stage1RevivalData = JSON.parse(
          stage1Revival.value,
        ) as SQUID_GAME_REVIVAL;

        if (
          currentTime >= new Date(stage1RevivalData.startTime) &&
          currentTime <= new Date(stage1RevivalData.endTime) &&
          !participant
        ) {
          // this is stage 1 revival, because user don't have participant record
          await this._squidGameStage1Revival(
            userId,
            amount,
            stage1RevivalData.amountRequired,
            isReferral,
            queryRunner,
          );
        }
      }

      // stage 2 revival
      const stage2Revival = await queryRunner.manager
        .createQueryBuilder(Setting, 'setting')
        .where('setting.key = :key', {
          key: `SQUID_GAME_REVIVAL_STAGE_2`,
        })
        .getOne();
      if (stage2Revival) {
        stage2RevivalData = JSON.parse(
          stage2Revival.value,
        ) as SQUID_GAME_REVIVAL;

        if (
          currentTime >= new Date(stage2RevivalData.startTime) &&
          currentTime <= new Date(stage2RevivalData.endTime)
        ) {
          if (!participant) {
            // user don't have participant record, need to revive stage 1 first
            await this._squidGameStage1Revival(
              userId,
              amount,
              stage1RevivalData.amountRequired,
              isReferral,
              queryRunner,
            );
            return;
          }

          // participant already in stage 2, no need to revive
          if (participant.lastStage === 2) return;

          await this._squidGameStage2Revival(
            userId,
            amount,
            stage2RevivalData.amountRequired,
            participant,
            isReferral,
            queryRunner,
          );
        }
      }

      // stage 3 revival
      const stage3Revival = await queryRunner.manager
        .createQueryBuilder(Setting, 'setting')
        .where('setting.key = :key', {
          key: `SQUID_GAME_REVIVAL_STAGE_3`,
        })
        .getOne();
      if (stage3Revival) {
        stage3RevivalData = JSON.parse(
          stage3Revival.value,
        ) as SQUID_GAME_REVIVAL;

        if (
          currentTime >= new Date(stage3RevivalData.startTime) &&
          currentTime <= new Date(stage3RevivalData.endTime)
        ) {
          if (!participant) {
            // user don't have participant record, need to revive stage 1 first
            await this._squidGameStage1Revival(
              userId,
              amount,
              stage1RevivalData.amountRequired,
              isReferral,
              queryRunner,
            );
            return;
          }

          if (participant.lastStage === 1) {
            // user still in stage 1, need to revive stage 2 first
            await this._squidGameStage2Revival(
              userId,
              amount,
              stage2RevivalData.amountRequired,
              participant,
              isReferral,
              queryRunner,
            );
            return;
          }

          // participant already in stage 3, no need to revive
          if (participant.lastStage === 3) return;

          await this._squidGameStage3Revival(
            userId,
            amount,
            stage3RevivalData.amountRequired,
            participant,
            isReferral,
            queryRunner,
          );
        }
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

  private async _squidGameStage1Revival(
    userId: number,
    amount: number,
    amountRequired: number,
    isReferral: boolean,
    queryRunner: QueryRunner,
  ) {
    // create new revival record
    const squidGameRevival = new SquidGameRevival();
    squidGameRevival.userId = userId;
    squidGameRevival.stageNumber = 1;
    isReferral
      ? (squidGameRevival.amountReferred = amount)
      : (squidGameRevival.amountPaid = amount);
    await queryRunner.manager.save(squidGameRevival);

    // check if participant is eligible for next stage
    await this._updateParticipantStage(
      userId,
      1,
      amountRequired,
      null,
      queryRunner,
    );
  }

  private async _squidGameStage2Revival(
    userId: number,
    amount: number,
    amountRequired: number,
    participant: SquidGameParticipant,
    isReferral: boolean,
    queryRunner: QueryRunner,
  ) {
    // create new revival record
    const squidGameRevival = new SquidGameRevival();
    squidGameRevival.userId = userId;
    squidGameRevival.stageNumber = 2;
    isReferral
      ? (squidGameRevival.amountReferred = amount)
      : (squidGameRevival.amountPaid = amount);
    await queryRunner.manager.save(squidGameRevival);

    // check if participant is eligible for next stage
    await this._updateParticipantStage(
      userId,
      2,
      amountRequired,
      participant,
      queryRunner,
    );
  }

  private async _squidGameStage3Revival(
    userId: number,
    amount: number,
    amountRequired: number,
    participant: SquidGameParticipant,
    isReferral: boolean,
    queryRunner: QueryRunner,
  ) {
    // create new revival record
    const squidGameRevival = new SquidGameRevival();
    squidGameRevival.userId = userId;
    squidGameRevival.stageNumber = 3;
    isReferral
      ? (squidGameRevival.amountReferred = amount)
      : (squidGameRevival.amountPaid = amount);
    await queryRunner.manager.save(squidGameRevival);

    // check if participant is eligible for next stage
    await this._updateParticipantStage(
      userId,
      3,
      amountRequired,
      participant,
      queryRunner,
    );
  }

  private async _updateParticipantStage(
    userId: number,
    stage: number,
    amountRequired: number,
    participant: SquidGameParticipant | null,
    queryRunner: QueryRunner,
  ) {
    // get all revival records for particular user and stage
    const squidGameRevivals = await queryRunner.manager
      .createQueryBuilder(SquidGameRevival, 'revival')
      .where('revival.userId = :userId', { userId })
      .andWhere('revival.stageNumber = :stageNumber', {
        stageNumber: stage,
      })
      .getMany();
    // calculate total amount deposited
    const totalAmountPaid = squidGameRevivals.reduce(
      (total, revival) => total + revival.amountPaid + revival.amountReferred,
      0,
    );
    // check if total amount deposited meet criteria, if so, update participant stage
    if (totalAmountPaid >= amountRequired) {
      if (!participant) {
        // update for stage 1: create new participant record
        const newParticipant = new SquidGameParticipant();
        newParticipant.userId = userId;
        newParticipant.lastStage = stage;
        newParticipant.participantStatus = `SQUID_GAME_STAGE_${stage.toString()}_REVIVED`;
        await queryRunner.manager.save(newParticipant);
      } else {
        // update for stage 2, 3: update participant record
        participant.lastStage = stage;
        participant.participantStatus = `SQUID_GAME_STAGE_${stage.toString()}_REVIVED`;
        await queryRunner.manager.save(participant);
      }
    }
  }

  async getSquidGameParticipantRevivalData(userId: number): Promise<{
    amountRequiredToStage1: number;
    amountRequiredToStage2: number;
    amountRequiredToStage3: number;
  }> {
    const currentRevivalStage = await this.getSquidGameRevivalStage();
    const squidGameData = await this.getSquidGameData();

    const participant = await this.squidGameParticipantRepository
      .createQueryBuilder('participant')
      .where('participant.userId = :userId', { userId })
      .getOne();

    if (currentRevivalStage === 1) {
      if (!participant) {
        const squidGameRevivalStage1 = await this.squidGameRevivalRepository
          .createQueryBuilder('revival')
          .where('revival.userId = :userId', { userId })
          .andWhere('revival.stageNumber = :stageNumber', {
            stageNumber: 1,
          })
          .getMany();
        const totalAmount = squidGameRevivalStage1.reduce(
          (total, revival) =>
            total + revival.amountPaid + revival.amountReferred,
          0,
        );

        return {
          amountRequiredToStage1:
            squidGameData.stage1RevivalData.amountRequired - totalAmount,
          amountRequiredToStage2: 0,
          amountRequiredToStage3: 0,
        };
      }
    }

    if (currentRevivalStage === 2) {
      if (!participant) {
        const squidGameRevivalStage1 = await this.squidGameRevivalRepository
          .createQueryBuilder('revival')
          .where('revival.userId = :userId', { userId })
          .andWhere('revival.stageNumber = :stageNumber', {
            stageNumber: 1,
          })
          .getMany();
        const totalAmount = squidGameRevivalStage1.reduce(
          (total, revival) =>
            total + revival.amountPaid + revival.amountReferred,
          0,
        );

        return {
          amountRequiredToStage1:
            squidGameData.stage1RevivalData.amountRequired - totalAmount,
          amountRequiredToStage2:
            squidGameData.stage2RevivalData.amountRequired,
          amountRequiredToStage3: 0,
        };
      } else if (participant.lastStage === 1) {
        const squidGameRevivalStage2 = await this.squidGameRevivalRepository
          .createQueryBuilder('revival')
          .where('revival.userId = :userId', { userId })
          .andWhere('revival.stageNumber = :stageNumber', {
            stageNumber: 2,
          })
          .getMany();
        const totalAmount = squidGameRevivalStage2.reduce(
          (total, revival) =>
            total + revival.amountPaid + revival.amountReferred,
          0,
        );

        return {
          amountRequiredToStage1: 0,
          amountRequiredToStage2:
            squidGameData.stage2RevivalData.amountRequired - totalAmount,
          amountRequiredToStage3: 0,
        };
      }

      return {
        amountRequiredToStage1: 0,
        amountRequiredToStage2: 0,
        amountRequiredToStage3: 0,
      };
    }

    if (currentRevivalStage === 3) {
      if (!participant) {
        const squidGameRevivalStage1 = await this.squidGameRevivalRepository
          .createQueryBuilder('revival')
          .where('revival.userId = :userId', { userId })
          .andWhere('revival.stageNumber = :stageNumber', {
            stageNumber: 1,
          })
          .getMany();
        const totalAmount = squidGameRevivalStage1.reduce(
          (total, revival) =>
            total + revival.amountPaid + revival.amountReferred,
          0,
        );

        return {
          amountRequiredToStage1:
            squidGameData.stage1RevivalData.amountRequired - totalAmount,
          amountRequiredToStage2:
            squidGameData.stage2RevivalData.amountRequired,
          amountRequiredToStage3:
            squidGameData.stage3RevivalData.amountRequired,
        };
      } else if (participant.lastStage === 1) {
        const squidGameRevivalStage2 = await this.squidGameRevivalRepository
          .createQueryBuilder('revival')
          .where('revival.userId = :userId', { userId })
          .andWhere('revival.stageNumber = :stageNumber', {
            stageNumber: 2,
          })
          .getMany();
        const totalAmount = squidGameRevivalStage2.reduce(
          (total, revival) =>
            total + revival.amountPaid + revival.amountReferred,
          0,
        );

        return {
          amountRequiredToStage1: 0,
          amountRequiredToStage2:
            squidGameData.stage2RevivalData.amountRequired - totalAmount,
          amountRequiredToStage3:
            squidGameData.stage3RevivalData.amountRequired,
        };
      } else if (participant.lastStage === 2) {
        const squidGameRevivalStage3 = await this.squidGameRevivalRepository
          .createQueryBuilder('revival')
          .where('revival.userId = :userId', { userId })
          .andWhere('revival.stageNumber = :stageNumber', {
            stageNumber: 3,
          })
          .getMany();
        const totalAmount = squidGameRevivalStage3.reduce(
          (total, revival) =>
            total + revival.amountPaid + revival.amountReferred,
          0,
        );

        return {
          amountRequiredToStage1: 0,
          amountRequiredToStage2: 0,
          amountRequiredToStage3:
            squidGameData.stage3RevivalData.amountRequired - totalAmount,
        };
      }

      return {
        amountRequiredToStage1: 0,
        amountRequiredToStage2: 0,
        amountRequiredToStage3: 0,
      };
    }

    return {
      amountRequiredToStage1: 0,
      amountRequiredToStage2: 0,
      amountRequiredToStage3: 0,
    };
  }
}
