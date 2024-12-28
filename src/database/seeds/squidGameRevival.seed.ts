import { Seeder } from 'typeorm-extension';
import { DataSource } from 'typeorm';

const stage1RevivalStartTime: Date = new Date('2024-12-09T00:00:00Z'); // in UTC
const stage1RevivalEndTime: Date = new Date('2024-12-15T23:59:59Z'); // in UTC
const stage1RevivalAmountRequired: number = 10; // 100 means 100 USDT/GameUSD

const stage2RevivalStartTime: Date = new Date('2024-12-16T00:00:00Z'); // in UTC
const stage2RevivalEndTime: Date = new Date('2024-12-22T23:59:59Z'); // in UTC
const stage2RevivalAmountRequired: number = 10; // 100 means 100 USDT/GameUSD

const stage3RevivalStartTime: Date = new Date('2024-12-23T00:00:00Z'); // in UTC
const stage3RevivalEndTime: Date = new Date('2024-12-29T23:59:59Z'); // in UTC
const stage3RevivalAmountRequired: number = 10; // 100 means 100 USDT/GameUSD

// for example,

export type SQUID_GAME_REVIVAL = {
  startTime: Date;
  endTime: Date;
  amountRequired: number;
};

export default class SquidGameRevival implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource): Promise<void> {
    try {
      // insert or update into setting table
      await dataSource
        .createQueryBuilder()
        .insert()
        .into('setting')
        .values([
          {
            key: 'SQUID_GAME_REVIVAL_STAGE_1',
            value: JSON.stringify({
              startTime: stage1RevivalStartTime,
              endTime: stage1RevivalEndTime,
              amountRequired: stage1RevivalAmountRequired,
            } as SQUID_GAME_REVIVAL),
          },
        ])
        .orUpdate(['value'], ['key'])
        .execute();

      await dataSource
        .createQueryBuilder()
        .insert()
        .into('setting')
        .values([
          {
            key: 'SQUID_GAME_REVIVAL_STAGE_2',
            value: JSON.stringify({
              startTime: stage2RevivalStartTime,
              endTime: stage2RevivalEndTime,
              amountRequired: stage2RevivalAmountRequired,
            } as SQUID_GAME_REVIVAL),
          },
        ])
        .orUpdate(['value'], ['key'])
        .execute();

      await dataSource
        .createQueryBuilder()
        .insert()
        .into('setting')
        .values([
          {
            key: 'SQUID_GAME_REVIVAL_STAGE_3',
            value: JSON.stringify({
              startTime: stage3RevivalStartTime,
              endTime: stage3RevivalEndTime,
              amountRequired: stage3RevivalAmountRequired,
            } as SQUID_GAME_REVIVAL),
          },
        ])
        .orUpdate(['value'], ['key'])
        .execute();
    } catch (error) {
      console.error('Error executing seed:', error);
    }
  }
}
