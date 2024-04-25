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
          walletAddress: '0xAe8b9277cad0aBAA728b7a34F20570f4377E1055',
          privateKey: '',
          redeemableBalance: 0,
          pointBalance: 0,
          userId: 1
        },
      ])
      .execute();
  }
}
