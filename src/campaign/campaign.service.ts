import { BadRequestException, Injectable } from '@nestjs/common';
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

@Injectable()
export class CampaignService {
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
      const activeCampaigns = await this.campaignRepository.find({
        where: {
          claimApproach,
          startTime: LessThan(new Date().getTime() / 1000),
          endTime: MoreThan(new Date().getTime() / 1000),
        },
      });

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
    const userInfo = await queryRunner.manager.findOne(User, {
      where: { id: userId },
      relations: ['wallet'],
    });
    if (!userInfo) return;

    const campaigns =
      await this.findActiveCampaignsByClaimApproach(claimApproach);

    const activeCampaigns = campaigns.filter(
      (campaign) => campaign.maxNumberOfClaims > campaign.creditWalletTx.length,
    );

    switch (claimApproach) {
      case ClaimApproach.SIGNUP:
        return await this.claimSignupCampaign(
          userInfo,
          activeCampaigns,
          queryRunner,
        );
      default:
        return;
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
      for (const campaign of campaigns) {
        const hasUserClaimed = campaign.creditWalletTx.some(
          (tx) =>
            tx.walletId === userInfo.wallet.id && tx.campaign === campaign,
        );

        if (hasUserClaimed) continue;

        if (campaign.validationParams) {
          const validations = JSON.parse(campaign.validationParams);
          const referralCode = validations.referralCode;

          const referrer = await queryRunner.manager.findOne(User, {
            where: { referralCode },
          });

          if (userInfo.referralUser && userInfo.referralUserId != referrer.id) {
            continue;
          }
        }

        creditTx = await this.creditService.addCreditQueryRunner(
          {
            amount: campaign.rewardPerUser,
            walletAddress: userInfo.wallet.walletAddress,
          },
          queryRunner,
          false,
        );

        //TODO add to array, which will later be added to queue  after commiting
      }

      if (!creditTx) {
        //not eligible for any KOL campaign, add default signup bonus
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
    } finally {
      if (!runner && !queryRunner.isReleased) await queryRunner.release();
    }
  }

  private async handleDefaultSignupBonus(
    userInfo: User,
    activeCampaigns: Campaign[],
    queryRunner: QueryRunner,
  ) {
    const defaultCampaign = activeCampaigns.find(
      (c) => c.name === 'Signup Bonus',
    );
    const hasUserClaimed = defaultCampaign.creditWalletTx.some(
      (tx) =>
        tx.walletId === userInfo.wallet.id && tx.campaign === defaultCampaign,
    );

    if (hasUserClaimed) return;
    const referralUserId = userInfo.referralUserId;

    if (defaultCampaign.validationParams && referralUserId) {
      const validations = JSON.parse(defaultCampaign.validationParams);
      const ignoredRefferers = validations.ignoredRefferers;

      const referrer = await queryRunner.manager.findOne(User, {
        where: { id: referralUserId },
      });

      if (
        ignoredRefferers &&
        ignoredRefferers.length > 0 &&
        ignoredRefferers.includes(referrer.referralCode)
      ) {
        return;
      }
    }

    const creditTx = await this.creditService.addCreditQueryRunner(
      {
        amount: defaultCampaign.rewardPerUser,
        walletAddress: userInfo.wallet.walletAddress,
      },
      queryRunner,
      false,
    );

    return creditTx;
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
