import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';

const projectName = 'FUYO X SQUID GAME - STAGE 1'; // to update, must match with contract
const startTime = '2024-12-16 00:00:00'; // to update, in UTC
const endTime = '2024-12-22 23:59:59'; // to update, in UTC

export default class CreateJackpot implements Seeder {
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
    // get last round
    let round = 0;
    const jackpot = await dataSource
      .createQueryBuilder()
      .select('round')
      .from('jackpot', 'jackpot')
      .getOne();
    if (jackpot) {
      round = jackpot.round + 1;
    }

    const result = await dataSource
      .createQueryBuilder()
      .insert()
      .into('jackpot')
      .values([
        {
          round: round,
          projectName: projectName,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          duration:
            (new Date(endTime).getTime() - new Date(startTime).getTime()) /
            1000,
          minimumBetAmount: 2,
          feeTokenAddress: '0x0000000000000000000000000000000000000000',
          feeAmount: 0,
        },
      ])
      .execute();
    console.log(result);
  }
}
// npm run seed:run -- -n src/database/seeds/jackpot.seed.ts
