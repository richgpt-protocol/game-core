import { Connection } from 'typeorm';
import { Factory, Seeder } from 'typeorm-seeding';
import { SettingEnum } from '../../shared/enum/setting.enum';

export default class UpdateSetting implements Seeder {
  public async run(factory: Factory, connection: Connection): Promise<void> {
    await connection
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
