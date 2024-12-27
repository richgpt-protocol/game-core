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
import { Cron, CronExpression } from '@nestjs/schedule';
import { Setting } from 'src/setting/entities/setting.entity';
import { SQUID_GAME_STAGE_2 } from 'src/database/seeds/squidGameStage2.seed';
import { JackpotTx } from 'src/game/entities/jackpot-tx.entity';
import { ConfigService } from 'src/config/config.service';

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

    return {
      stage1ParticipantCount,
      stage2ParticipantCount,
      stage3ParticipantCount,
      stage4ParticipantCount,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleUpdateSquidGameStage2Participant() {
    const setting = await this.settingRepository
      .createQueryBuilder('setting')
      .where('setting.key = :key', { key: 'ENABLE_SQUID_GAME_STAGE_2' })
      .getOne();
    if (!setting) return;
    const squidGameStage2 = JSON.parse(setting.value) as SQUID_GAME_STAGE_2;

    const currentTime = new Date();
    if (
      currentTime >= new Date(squidGameStage2.endTime) &&
      !squidGameStage2.participantIsUpdated
    ) {
      const jackpotTxs = await this.jackpotTxRepository
        .createQueryBuilder('jackpotTx')
        .leftJoinAndSelect('jackpotTx.walletTx', 'walletTx')
        .leftJoinAndSelect('walletTx.userWallet', 'userWallet')
        .leftJoinAndSelect('jackpotTx.jackpot', 'jackpot')
        .where('jackpot.projectName = :projectName', {
          projectName: squidGameStage2.projectName,
        })
        .andWhere('jackpotTx.status = :status', {
          status: TxStatus.SUCCESS,
        })
        .getMany();

      for (const jackpotTx of jackpotTxs) {
        if (jackpotTx.randomHash.endsWith(squidGameStage2.seedChar)) {
          const participant = await this.squidGameParticipantRepository
            .createQueryBuilder('participant')
            .where('participant.userId = :userId', {
              userId: jackpotTx.walletTx.userWallet.userId,
            })
            .andWhere('participant.lastStage = 1')
            .getOne();
          if (participant) {
            participant.lastStage = 2;
            await this.squidGameParticipantRepository.save(participant);
          }
        }
      }

      squidGameStage2.participantIsUpdated = true;
      setting.value = JSON.stringify(squidGameStage2);
      await this.settingRepository.save(setting);
    }
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
}
