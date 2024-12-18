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
          value: 0.01, // 1%
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_BNB_TESTNET,
          value: 0.01, // 1%
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_OPBNB,
          value: 0.01, // 1%
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_OPBNB_TESTNET,
          value: 0.01, // 1%
        },
        {
          key: SettingEnum.DEPOSIT_NOTIFY_THRESHOLD,
          value: 100,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_1,
          value: 0.01, // 1%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_2,
          value: 0.02, // 2%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_3,
          value: 0.03, // 3%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_4,
          value: 0.04, // 4%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_5,
          value: 0.05, // 5%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_6,
          value: 0.06, // 6%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_7,
          value: 0.07, // 7%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_8,
          value: 0.08, // 8%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_9,
          value: 0.09, // 9%
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_10,
          value: 0.1, // 10%
        },
        {
          key: SettingEnum.MINI_GAME_USDT_SENDER_ADDRESS,
          value: '0x3559318f1F2e53696D98F78cEe5223b127143AA1', //Testnet address. Should be replaced
        },
        {
          key: SettingEnum.CREDIT_EXPIRY_DAYS,
          value: 90,
        },
        {
          key: SettingEnum.FILTERED_REFERRAL_CODES,
          value: JSON.stringify([]),
        },
        {
          key: SettingEnum.BOT_ACCOUNT_USER_IDS,
          value: JSON.stringify([]),
        },
      ])
      .execute();
  }
}
