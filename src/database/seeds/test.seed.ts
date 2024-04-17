import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { DataSource } from 'typeorm';

export default class CreateTest implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    // create user account
    await dataSource
      .createQueryBuilder()
      .insert()
      .into('user')
      .values([
        {
          phoneNumber: '0168714568',
          referralCode: '2Eh4XVW41',
          status: 'A',
          isReset: false,
          verificationCode: '123456',
          loginAttempts: 0,
          isMobileVerified: true,
          otpGenerateTime: null,
          referralRank: 1,
          otpMethod: 'TELEGRAM',
          emailAddress: null,
          isEmailVerified: false,
          emailVerificationCode: null,
          emailOtpGenerateTime: null,
          updatedBy: 'self',
          referralUserId: null,
          walletId: 1,
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
          walletAddress: '0x7DEEfd8a2D58b43f8c104C779D277Bc2732Eb014',
          privateKey:
            '0x7405135149e1595760645c252ec90fddd17c87a61f9a944b4626804c1483e3fa',
          redeemableBalance: 0,
          pointBalance: 0,
          updateDate: new Date(Date.now()),
          userId: 1,
        },
      ])
      .execute();

    // deposit
    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('reload_tx')
    //     .values([
    //       {
    //         amount: 100,
    //         status: 'S',
    //         chainId: 5611,
    //         currency: 'USDT',
    //         amountInUSD: 100,
    //         txHash: '0x',
    //         userWalletId: 1
    //       },
    //     ])
    //     .execute();

    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('deposit_tx')
    //     .values([
    //       {
    //         currency: 'GameUSD',
    //         senderAddress: '0xe99e275c55F5700bbC771A923B6fD704A6E5AF1B',
    //         receiverAddress: '0x1C3705E7148ca83Fa90be7C05A62cFC08dE510fB',
    //         chainId: 5611,
    //         isTransferred: true,
    //         txHash: '0x',
    //       },
    //     ])
    //     .execute();

    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('wallet_tx')
    //     .values([
    //       {
    //         txType: 'DEPOSIT',
    //         txAmount: 100,
    //         txHash: '0x',
    //         status: 'S',
    //         startingBalance: 0,
    //         endingBalance: 100,
    //         userWalletId: 1,
    //       },
    //     ])
    //     .execute();

    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('game_usd_tx')
    //     .values([
    //       {
    //         amount: 100,
    //         chainId: 5611,
    //         status: 'S',
    //         txHash: '0x',
    //         amountInUSD: 100,
    //         currency: 'GameUSD',
    //         senderAddress: '0xe99e275c55F5700bbC771A923B6fD704A6E5AF1B',
    //         receiverAddress: '0x1C3705E7148ca83Fa90be7C05A62cFC08dE510fB',
    //         walletTxId: 1
    //       },
    //     ])
    //     .execute();

    //   await dataSource.query(
    //     `
    //     UPDATE wallet_tx
    //     SET depositTxId = 1, gameUsdTxId = 1
    //     WHERE id = 1;
    //     `
    //   );

    //   await dataSource
    //     .createQueryBuilder()
    //     .update('user_wallet')
    //     .set({ walletBalance: 100 })
    //     .where({ id: 1 })
    //     .execute();

    //   // bet
    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('wallet_tx')
    //     .values([
    //       {
    //         txType: 'PLAY',
    //         txAmount: 1,
    //         txHash: '0x',
    //         status: 'S',
    //         startingBalance: 100,
    //         endingBalance: 99,
    //         userWalletId: 1,
    //       },
    //     ])
    //     .execute();

    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('game_usd_tx')
    //     .values([
    //       {
    //         amount: 1,
    //         chainId: 5611,
    //         status: 'S',
    //         txHash: '0x',
    //         amountInUSD: 1,
    //         currency: 'GameUSD',
    //         senderAddress: '0x1C3705E7148ca83Fa90be7C05A62cFC08dE510fB',
    //         receiverAddress: '0xe99e275c55F5700bbC771A923B6fD704A6E5AF1B',
    //         walletTxId: 1
    //       },
    //     ])
    //     .execute();

    //   await dataSource.query(
    //     `
    //     UPDATE wallet_tx
    //     SET gameUsdTxId = 2
    //     WHERE id = 2;
    //     `
    //   );

    //   await dataSource
    //     .createQueryBuilder()
    //     .update('user_wallet')
    //     .set({ walletBalance: 99 })
    //     .where({ id: 1 })
    //     .execute();

    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('bet_order')
    //     .values([
    //       {
    //         numberPair: '4896',
    //         bigForecastAmount: 1,
    //         smallForecaseAmount: 0,
    //         txHash: '0x',
    //         gameId: 1,
    //         walletTxId: 2,
    //       },
    //     ])
    //     .execute();

    //   // set draw result
    //   await dataSource
    //     .createQueryBuilder()
    //     .update('game')
    //     .set({ isClosed: true })
    //     .where({ id: 1 })
    //     .execute();

    //   await dataSource
    //     .createQueryBuilder()
    //     .insert()
    //     .into('draw_result')
    //     .values([
    //       {
    //         prizeCategory: 1,
    //         prizeIndex: 0,
    //         numberPair: '4896',
    //         gameId: 1,
    //       },
    //     ])
    //     .execute();

    //   await dataSource
    //     .createQueryBuilder()
    //     .update('bet_order')
    //     .set({
    //       availableClaim: true,
    //     })
    //     .where({
    //       gameId: 1,
    //       numberPair: '4896',
    //     })
    //     .execute();
  }
}
