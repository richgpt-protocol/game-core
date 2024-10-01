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

  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
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
          key: SettingEnum.WITHDRAWAL_FEES_BNB_TESTNET,
          value: 0.22,
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_OPBNB,
          value: 0.2,
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_OPBNB_TESTNET,
          value: 0.2,
        },
        {
          key: SettingEnum.DEPOSIT_NOTIFY_THRESHOLD,
          value: 100,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_1,
          value: 3,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_2,
          value: 6,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_3,
          value: 9,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_4,
          value: 12,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_5,
          value: 15,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_6,
          value: 18,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_7,
          value: 21,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_8,
          value: 24,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_9,
          value: 27,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_10,
          value: 30,
        },
        {
          key: SettingEnum.CREDIT_EXPIRY_DAYS,
          value: 90,
        },
      ])
      .execute();
  }
}
