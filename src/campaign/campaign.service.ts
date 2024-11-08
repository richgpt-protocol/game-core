import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import {
  DataSource,
  LessThan,
  MoreThan,
  QueryRunner,
  Repository,
} from 'typeorm';
import { CreateCampaignDto } from './dto/campaign.dto';
import { ClaimApproach } from 'src/shared/enum/campaign.enum';
import { User } from 'src/user/entities/user.entity';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { CreditService } from 'src/wallet/services/credit.service';
import { TxStatus } from 'src/shared/enum/status.enum';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
    private datasource: DataSource,
    private creditService: CreditService,
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
      console.log(error);
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
      console.error(error);
      throw new Error('Failed to fetch active campaigns');
    }
  }

  async executeClaim(
    claimApproach: ClaimApproach,
    userId: number,
    queryRunner?: QueryRunner,
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
            tx.walletId === userInfo.wallet.id &&
            tx.campaign.id === campaign.id,
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
          tx.campaign.id === defaultCampaign.id,
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

    return successfulClaims.length < campaign.maxNumberOfClaims;
  }

  async findActiveCampaigns() {
    const currentTime = new Date().getTime() / 1000;

    const campaigns = await this.campaignRepository.find({
      where: {
        startTime: LessThan(currentTime),
        endTime: MoreThan(currentTime),
      },
    });

    return campaigns;
  }
}
