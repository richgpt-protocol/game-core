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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          value: '-',
        },
        {
          key: SettingEnum.SUPPORT_CONTACT_EMAIL,
          value: 'hello@fuyo.lol',
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

        // withdrawal fees
        {
          key: SettingEnum.WITHDRAWAL_FEES_BNB,
          value: 0.01,
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_BNB_TESTNET,
          value: 0.01,
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_OPBNB,
          value: 0.01,
        },
        {
          key: SettingEnum.WITHDRAWAL_FEES_OPBNB_TESTNET,
          value: 0.01,
        },
        {
          key: SettingEnum.DEPOSIT_NOTIFY_THRESHOLD,
          value: 1000,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_1,
          value: 1,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_2,
          value: 2,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_3,
          value: 3,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_4,
          value: 4,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_5,
          value: 5,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_6,
          value: 6,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_7,
          value: 7,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_8,
          value: 8,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_9,
          value: 9,
        },
        {
          key: SettingEnum.REFERRAL_PRIZE_BONUS_TIER_10,
          value: 10,
        },
        {
          key: SettingEnum.MINI_GAME_USDT_SENDER_ADDRESS,
          value: '0x38f7A3Ab829557b45Fb3A7c323F45ed1eEeaEB92', //Testnet address. Should be replaced
        },
        {
          key: SettingEnum.ENABLE_SIGNUP_BONUS,
          value: JSON.stringify({
            startTime: 1727807400,
            endTime: 1733077800,
            noOfUsers: 500,
            creditAmount: 5,
          }),
        },
        {
          key: SettingEnum.CREDIT_EXPIRY_DAYS,
          value: 90,
        },
        {
          key: SettingEnum.FILTERED_REFERRAL_CODES,
          value: JSON.stringify([]),
        },
      ])
      .execute();
  }
}
