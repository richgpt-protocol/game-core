import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';

export default class CreateTest implements Seeder {
  public async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {

    await dataSource
      .createQueryBuilder()
      .insert()
      .into('user')
      .values([
        {
          uid: '0123456789',
          phoneNumber: '0123456789',
          referralCode: 'VW412Eh4X',
          status: 'A',
          isReset: false,
          verificationCode: null,
          loginAttempts: 0,
          isMobileVerified: true,
          otpGenerateTime: null,
          referralRank: 1,
          otpMethod: '',
          emailAddress: null,
          isEmailVerified: false,
          emailVerificationCode: null,
          emailOtpGenerateTime: null,
          updatedBy: null,
          referralUserId: null,
          walletId: 1
        },
      ])
      .execute();

    await dataSource
      .createQueryBuilder()
      .insert()
      .into('user_wallet')
      .values([
        {
          walletBalance: 0,
          creditBalance: 0,
          walletAddress: '0xb1AD074E17AD59f2103A8832DADE917388D6C50D',
          privateKey: '',
          redeemableBalance: 0,
          pointBalance: 0,
          userId: 1
        },
      ])
      .execute();
  }
}
