import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { ClaimApproach } from '../..//shared/enum/campaign.enum';

export default class CreateCampaigns implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('campaign')
      .values([
        {
          name: 'Signup Bonus',
          description: 'Signup Bonus',
          rewardPerUser: 5,
          startTime: 1730968522,
          endTime: 1830968523,
          maxNumberOfClaims: 100,
          claimApproach: ClaimApproach.SIGNUP,
          validationParams: JSON.stringify({
            ignoredReferralCodes: ['fuyoCRAZY10', 'fuyoHOPE11'], //TODO replace
          }),
        },
      ])
      .execute();
  }
}
