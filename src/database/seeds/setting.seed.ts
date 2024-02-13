import { Connection } from 'typeorm';
import { Factory, Seeder } from 'typeorm-seeding';
import { SettingEnum } from '../../shared/enum/setting.enum';

export default class CreateSettings implements Seeder {
  public async run(factory: Factory, connection: Connection): Promise<void> {
    await connection
      .createQueryBuilder()
      .insert()
      .into('setting')
      .values([
        {
          key: SettingEnum.SUPPORT_CONTACT_NUMBER,
          value: '013-2066680',
        },
        {
          key: SettingEnum.SUPPORT_CONTACT_EMAIL,
          value: 'dev.richgpt@gmail.com',
        },
        {
          key: SettingEnum.EMAIL_ENABLE,
          value: 'N',
        },
        {
          key: SettingEnum.SENDGRID_API_KEY,
          value: process.env.SENDGRID_API_KEY,
        },
        {
          key: SettingEnum.SENDER_EMAIL,
          value: '',
        },
        {
          key: SettingEnum.MAINTENANCE_MODE,
          value: 'N',
        },
        {
          key: SettingEnum.ENABLE_SMS,
          value: 'N',
        },
        {
          key: SettingEnum.MESSAGE_SERVICE_SID,
          value: process.env.MESSAGE_SERVICE_SID,
        },
      ])
      .execute();
  }
}
