import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { SettingEnum } from '../../shared/enum/setting.enum';

export default class UpdateSetting implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('setting')
      .values([
        {
          key: SettingEnum.LITE_SCREENING_LOCKED_PERIOD,
          value: 90,
        },
      ])
      .execute();
  }
}
