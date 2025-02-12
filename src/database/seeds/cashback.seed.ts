import { Seeder } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { SettingEnum } from '../../shared/enum/setting.enum';

export default class CreateCashbackCampaign implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource): Promise<void> {
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('setting')
      .values([
        {
          key: SettingEnum.CASHBACK_CAMPAIGN,
          value: JSON.stringify({
            startTime: '2025-02-10 00:00:00', // to update, UTC time
            endTime: '2025-02-16 23:59:59', // to update, UTC time
            capPerEpoch: 1000,
          }),
        },
      ])
      .orUpdate(['value'], ['key'])
      .execute();
  }
}
