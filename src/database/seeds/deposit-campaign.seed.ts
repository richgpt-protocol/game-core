import { ClaimApproach } from '../../shared/enum/campaign.enum';
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export default class CreateDepositCampaign implements Seeder {
  track = false;

  public async run(
    dataSource: DataSource,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const result = await dataSource
      .createQueryBuilder()
      .insert()
      .into('campaign')
      .values([
        {
          name: 'Deposit $1 USDT Free $1 Credit',
          description: 'Deposit $1 USDT Free $1 Credit',
          rewardPerUser: 1,
          startTime: 1736093942,
          endTime: 1893860342,
          maxNumberOfClaims: 0,
          claimApproach: ClaimApproach.MANUAL,
          validationParams: null,
        },
        {
          name: 'Deposit $10 USDT Free $10 Credit',
          description: 'Deposit $10 USDT Free $10 Credit',
          rewardPerUser: 10,
          startTime: 1736093942,
          endTime: 1893860342,
          maxNumberOfClaims: 0,
          claimApproach: ClaimApproach.MANUAL,
          validationParams: null,
        },
      ])
      .execute();
    console.log(result);
  }
}
// npm run seed:run -- -n src/database/seeds/deposit-campaign.seed.ts
