import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';
import { SettingEnum } from '../../shared/enum/setting.enum';

export default class CreateSettings implements Seeder {
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
        // default settings
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

        // lite screening locked period
        {
          key: SettingEnum.LITE_SCREENING_LOCKED_PERIOD,
          value: 90,
        },

        // withdrawal fees
        {
          key: SettingEnum.WITHDRAWAL_FEES_BNB,
          value: 0.22,
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_OPBNB,
          value: 0.2,
        },
      ])
      .execute();
  }
}
