import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { CreateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
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
