/* eslint-disable @typescript-eslint/no-unused-vars */
import {Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { GetUsersDto, RegisterUserDto } from './dto/register-user.dto';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { RandomUtil } from 'src/shared/utils/random.util';
import { UserStatus } from 'src/shared/enum/status.enum';
import { Provider } from 'src/shared/enum/provider.enum';
import { UtilConstant } from 'src/shared/constants/util.constant';
import { buildFilterCriterias } from 'src/shared/utils/pagination.util';
import { ObjectUtil } from 'src/shared/utils/object.util';
import { DateUtil } from 'src/shared/utils/date.util';

import { ethers } from 'ethers';
import axios from 'axios';
import { MPC } from 'src/shared/mpc';
import { Referral__factory } from 'src/contract';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { SMSService } from 'src/shared/services/sms.service';
import { UserLoginDto } from 'src/auth/dto/login.dto';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { SettingEnum } from 'src/shared/enum/setting.enum';

const serverUrls = [
  // TO CHANGE
  'http://localhost:4896',
  'http://localhost:4897',
  'http://localhost:4898',
];

type SetReferrerEvent = {
  txHash: string;
  referralTxId: number;
  userId: number;
};

type GenerateOtpEvent = {
  userId: number;
};

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserWallet)
    private userWalletRepository: Repository<UserWallet>,
    @InjectRepository(ReferralTx)
    private referralTxRepository: Repository<ReferralTx>,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private adminNotificationService: AdminNotificationService,
    private smsService: SMSService,
    private cacheSettingService: CacheSettingService,
  ) {}

  async findOne(id: number) {
    return await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      // .addSelect('row.password')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        id,
      })
      .getOne();
  }

  async findOneWithoutHiddenFields(id) {
    return await this.userRepository.findOneBy(id);
  }

  async findReferralCodeWithoutHiddenFields(code: string) {
    return await this.userRepository.findOneBy({
      referralCode: code,
    });
  }

  async findByEmail(email: string) {
    return await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      // .addSelect('row.password')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        emailAddress: email,
      })
      .getOne();
  }

  async findByPhoneNumber(phoneNumber: string) {
    return await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      // .addSelect('row.password')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        phoneNumber: phoneNumber,
      })
      .getOne();
  }

  async findByCriteria(key: string, value: string) {
    const query = await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      // .addSelect('row.password')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        [key]: value,
      })
      .getOne();

    return query;
  }

  async findBySocialInfo(email: string, id: string, provider: string) {
    switch (provider) {
      case Provider.GOOGLE:
        return await this.userRepository
          .createQueryBuilder('row')
          .select('row')
          // .addSelect('row.password')
          .addSelect('row.isReset')
          .addSelect('row.verificationCode')
          .addSelect('row.loginAttempt')
          .where({
            emailAddress: email,
            googleToken: id,
          })
          .getOne();
      default:
        return null;
    }
  }

  async getUserInfo(id: number) {
    const { verificationCode, ...result } = await this.userRepository.findOneBy(
      {
        id,
      },
    );
    return result;
  }

  async register(payload: RegisterUserDto) {
    // check if phone exist
    let user = await this.userRepository.findOneBy({ phoneNumber: payload.phoneNumber });
    if (user && user.isMobileVerified) {
      // user && !user.isMobileVerified means user register but never success verified via otp
      return { error: 'phone number exist', data: null };
    }

    // check if referralCode valid
    let referralUserId = null;
    if (payload.referralCode) {
      const referralUser = await this.userRepository.findOne({
        where: { referralCode: payload.referralCode },
        relations: { wallet: true },
      });
      if (!referralUser) {
        return { error: 'invalid referral code', data: null };
      }
      referralUserId = referralUser.id;
    }

    // check if last otp generated within 60 seconds
    if (user && user.otpGenerateTime) {
      if (this.isOtpGeneratedWithin60Seconds(user.otpGenerateTime)) {
        return { error: 'otp generated within 60 seconds', data: null };
      }
    }

    try {
      // create user record if not exist
      if (!user) {
        user = this.userRepository.create({
          ...payload, // phoneNumber, otpMethod
          referralCode: null,
          status: UserStatus.UNVERIFIED,
          isReset: false,
          verificationCode: null,
          loginAttempt: 0,
          isMobileVerified: false,
          otpGenerateTime: null,
          referralRank: 1,
          otpMethod: payload.otpMethod,
          emailAddress: null,
          isEmailVerified: false,
          emailVerificationCode: null,
          emailOtpGenerateTime: null,
          updatedBy: null,
          referralUserId,
          referralTx: null,
          referredTx: null,
          wallet: null,
        });
        await this.userRepository.save(user);

      } else {
        // user register but never success verified via otp
        // update user otpMethod & referralUserId
        // other user attribute should same as above
        user.otpMethod = payload.otpMethod;
        user.referralUserId = referralUserId;
        await this.userRepository.save(user);
      }

      // pass to handleGenerateOtpEvent() to generate otp and send to user
      this.eventEmitter.emit('user.service.otp', { userId: user.id });

      // return user record
      return { error: null, data: user };

    } catch (err) {
      return { error: err.message, data: null };
    }
  }

  async signIn(phoneNumber: string) {
    // check if user exist
    const user = await this.userRepository.findOneBy({ phoneNumber });
    if (!user) {
      return { error: 'user.WRONG_PHONE_NUMBER', data: null };
    }

    // check user status
    switch (user.status) {
      case UserStatus.INACTIVE:
        return {
          error: 'user.ACCOUNT_INACTIVE',
        };
      case UserStatus.SUSPENDED:
        return {
          error: 'user.ACCOUNT_SUSPEND',
          args: {
            id: 1,
            supportEmail: this.cacheSettingService.get(
              SettingEnum.SUPPORT_CONTACT_EMAIL,
            ),
          },
        };
      case UserStatus.TERMINATED:
        return {
          error: 'user.ACCOUNT_TERMINATED',
        };
      case UserStatus.UNVERIFIED:
        return {
          error: 'user.ACCOUNT_UNVERIFIED',
        };
      case UserStatus.PENDING:
        return {
          error: 'user.ACCOUNT_PENDING',
        };
    }

    // check if last otp generated within 60 seconds
    if (user.otpGenerateTime) {
      if (this.isOtpGeneratedWithin60Seconds(user.otpGenerateTime)) {
        return { error: 'otp generated within 60 seconds', data: null };
      }
    }

    // pass to handleGenerateOtpEvent() to generate and send otp
    this.eventEmitter.emit('user.service.otp', { userId: user.id });

    return { error: null, data: user };
  }

  @OnEvent('user.service.otp', { async: true })
  async handleGenerateOtpEvent(payload: GenerateOtpEvent): Promise<void> {
    const user = await this.userRepository.findOneBy({ id: payload.userId });
    // this user won't be null because
    // 1. if come from register, user will be created
    // 2. if come from signIn, function will return error if user not exist

    try {
      // generate otp, update user record & send otp to user
      const code = RandomUtil.generateRandomNumber(6);
      await this.update(user.id, {
        verificationCode: code,
        otpGenerateTime: new Date(),
      });
      await this.smsService.sendUserRegistrationOTP(user.phoneNumber, user.otpMethod, code);

    } catch (err) {
      // inform admin for failed transaction
      await this.adminNotificationService.setAdminNotification(
        `Error occur in user.service.handleGenerateOtpEvent, error: ${err}, userId: ${payload.userId}`,
        'eventError',
        'Event error occurred',
        true,
      );
    }
  }

  private isOtpGeneratedWithin60Seconds(otpGenerateTime: Date) {
    const otpReGenerateTime = otpGenerateTime;
    otpReGenerateTime.setSeconds(60);
    if (DateUtil.compareDate(new Date(), otpReGenerateTime) < 0) {
      return true;
    }
    return false;
  }

  // async oauthRegister(
  //   email: string,
  //   lastName: string,
  //   firstName: string,
  //   picUrl: string,
  //   token: string,
  //   provider: string,
  // ) {
  //   let result;
  //   switch (provider) {
  //     case Provider.GOOGLE:
  //       result = await this.userRepository.save(
  //         this.userRepository.create({
  //           loginAttempt: 0,
  //           status: UserStatus.UNVERIFIED,
  //           isReset: false,
  //         }),
  //       );
  //       break;
  //   }

  //   if (result) {
  //     await this.update(result.id, {
  //       referralCode: this.generateReferralCode(result.id),
  //     });

  //     // await this.emailService.sendWelcomeEmail(
  //     //   UserRole.USER,
  //     //   result.emailAddress,
  //     //   result.id.toString(),
  //     //   result.name,
  //     // );
  //   }
  //   return result;
  // }

  async update(id: number, payload: any) {
    return await this.userRepository.update(id, {
      ...payload,
      updatedBy: UtilConstant.SELF,
    });
  }

  async verifyOtp(payload: UserLoginDto) {
    // fetch user record
    const user = await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.verificationCode')
      .addSelect('row.referralUser')
      .addSelect('row.wallet')
      .where({
        phoneNumber: payload.phoneNumber,
      })
      .getOne();

    // check if user exist
    if (!user) {
      return { error: 'invalid phone number', data: null };
    }
    // check if user login attempt exceed 3 times
    if (user.loginAttempt >= 3) {
      await this.update(user.id, {
        status: UserStatus.SUSPENDED,
      });
      return {
        error: 'user.EXCEED_LOGIN_ATTEMPT',
      };
    }
    // check if user otp is matched
    if (user.verificationCode !== payload.code) {
      // Increase failed login attempt
      await this.update(user.id, {
        loginAttempt: user.loginAttempt + 1,
      });
      return { error: 'user.FAILED_VERIFY_OTP', data: null };
    }
    // check if otp expired
    const otpExpiryTime = user.otpGenerateTime;
    otpExpiryTime.setSeconds(60); // Verify within 60 seconds
    if (DateUtil.compareDate(new Date(), otpExpiryTime) > 0) {
      return { error: 'user.OTP_EXPIRED', data: null };
    }

    // update user
    user.verificationCode = null;
    user.otpGenerateTime = null;
    user.updatedBy = UtilConstant.SELF;
    await this.userRepository.save(user);

    // for first success otp verification (first success account creation)
    if (user.status == UserStatus.UNVERIFIED) {
      // start queryRunner
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {

        // generate on-chain wallet
        // const walletAddress = await MPC.createWallet()
        const hdNodeWallet = ethers.Wallet.createRandom(); // temporarily
        const walletAddress = hdNodeWallet.address;

        // create userWallet record
        const userWallet = this.userWalletRepository.create({
          walletBalance: 0,
          creditBalance: 0,
          walletAddress,
          privateKey: hdNodeWallet.privateKey, // temporarily
          redeemableBalance: 0,
          pointBalance: 0,
          userId: user.id,
        });
        await queryRunner.manager.save(userWallet);

        // update user record
        user.wallet = userWallet;
        // generate user own referral code
        user.referralCode = this.generateReferralCode(user.id)
        await queryRunner.manager.save(user);

        // referral section
        if (user.referralUserId) {
          const referrerUserWallet = await this.userWalletRepository.findOneBy({ id: user.referralUserId });
          const referrerWalletAddress = referrerUserWallet.walletAddress;
          const userWalletAddress = user.wallet.walletAddress;

          // record user's referrer on-chain
          const provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);
          // const walletCreationBot = new ethers.Wallet(await MPC.retrievePrivateKey(process.env.WALLET_CREATION_BOT_ADDRESS));
          const walletCreationBot = new ethers.Wallet(
            process.env.WALLET_CREATION_BOT_PRIVATE_KEY, provider
          ); // temporarily
          const referralContract = Referral__factory.connect(
            process.env.REFERRAL_CONTRACT_ADDRESS,
            walletCreationBot,
          );
          const txResponse = await referralContract.setReferrer(
            userWalletAddress,
            referrerWalletAddress,
            { gasLimit: 70000 },
          );

          // create referralTx
          const referralTx = this.referralTxRepository.create({
            rewardAmount: 0,
            referralType: 'SET_REFERRER',
            bonusAmount: 0,
            bonusCurrency: 'USDT',
            status: 'P',
            txHash: txResponse.hash,
            userId: user.id,
            referralUserId: user.referralUserId,
          });
          await queryRunner.manager.save(referralTx);

          // emit event to handleSetReferrerEvent() to update on-chain status
          const referralPayload: SetReferrerEvent = {
            txHash: txResponse.hash,
            referralTxId: referralTx.id,
            userId: user.id,
          }
          this.eventEmitter.emit('user.service.referrer', referralPayload);
        }

        // update user
        user.status = UserStatus.ACTIVE;
        user.isMobileVerified = true;
        user.updatedBy = UtilConstant.SELF;
        await queryRunner.manager.save(user);

        // // Temporary hide
        // await this.emailService.sendWelcomeEmail(
        //   UserRole.USER,
        //   result.emailAddress,
        //   result.id.toString(),
        //   result.firstName,
        // );

        await queryRunner.commitTransaction();
          
      } catch (err) {
        await queryRunner.rollbackTransaction();
        
        // update user record
        user.status = UserStatus.PENDING;
        user.updatedBy = UtilConstant.SELF;
        await this.userRepository.update(user, {
          status: UserStatus.PENDING,
          updatedBy: UtilConstant.SELF,
        });

        // inform admin for rollback transaction
        await this.adminNotificationService.setAdminNotification(
          `Transaction in user.service.verifyOtp had been rollback, error: ${err}, userId: ${user.id}`,
          'rollbackTxError',
          'Transaction Rollbacked',
          true,
        );
        return { error: err.message, data: null };

      } finally {
        await queryRunner.release();
      }
    }

    return { error: null, data: user };
  }

  @OnEvent('user.service.referrer', { async: true })
  async handleSetReferrerEvent(payload: SetReferrerEvent): Promise<void> {
    // fetch txResponse from hash and wait for txReceipt
    const provider = new ethers.JsonRpcProvider(process.env.OPBNB_PROVIDER_RPC_URL);
    const txResponse = await provider.getTransaction(payload.txHash);
    const txReceipt = await txResponse.wait();

    const referralTx = await this.referralTxRepository.findOneBy({ id: payload.referralTxId });

    // start queryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {

      if (txReceipt.status === 1) {
        // update referralTx
        referralTx.status = 'S';
        await queryRunner.manager.save(referralTx);

      } else { // txReceipt.status === 0
        // update referralTx
        referralTx.status = 'PD';
        await queryRunner.manager.save(referralTx);

        // inform admin for failed on-chain set referrer tx
        await this.adminNotificationService.setAdminNotification(
          `setReferrer of Referral contract failed, please check. Tx hash: ${txReceipt.hash}, referralTxId: ${payload.referralTxId}`,
          'onChainTxError',
          'SetReferrer Failed',
          true,
        );
      }

      await queryRunner.commitTransaction();

    } catch (err) {
      // rollback queryRunner
      await queryRunner.rollbackTransaction();

      // update referralTx
      referralTx.status = 'PD';
      await this.referralTxRepository.save(referralTx);

      // inform admin for rollback transaction
      await this.adminNotificationService.setAdminNotification(
        `Transaction in user.service.handleSetReferrerEvent had been rollback, error: ${err}, referralTxId: ${payload.referralTxId}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
      );

    } finally {
      // finalize queryRunner
      await queryRunner.release();
    }
  }

  async getUsers(payload: GetUsersDto) {
    if (payload.orderBy != null && payload.orderBy != '') {
      payload.orderBy = 'user.' + payload.orderBy;
    }

    const { pagination, order } = buildFilterCriterias(payload);

    let query = this.userRepository.createQueryBuilder('user');

    if (payload.status != null && payload.status.length > 0) {
      query = query.andWhere(
        new Brackets((qb) => {
          qb.where('status IN (:...status)', {
            status: payload.status,
          });
        }),
      );
    }

    if (payload.keyword != null && payload.keyword != '') {
      query = query.andWhere(
        new Brackets((qb) => {
          // qb.where('user.firstName LIKE :firstName', {
          //   firstName: `%${payload.keyword}%`,
          // })
          //   .orWhere('user.referralCode LIKE :referralCode', {
          //     referralCode: `%${payload.keyword}%`,
          //   })
          //   .orWhere('user.phoneNumber LIKE :phoneNumber', {
          //     phoneNumber: `%${payload.keyword}%`,
          //   });
          qb.where('user.referralCode LIKE :referralCode', {
            referralCode: `%${payload.keyword}%`,
          }).orWhere('user.phoneNumber LIKE :phoneNumber', {
            phoneNumber: `%${payload.keyword}%`,
          });
        }),
      );
    }

    if (payload.fromDate != null && payload.fromDate != '') {
      query = query.andWhere('user.createdDate >= :fromDate', {
        fromDate: payload.fromDate,
      });
    }

    if (payload.toDate != null && payload.toDate != '') {
      const toDate = DateUtil.formatDate(
        DateUtil.addDays(DateUtil.parseStringtoDate(payload.toDate), 1),
        'YYYY-MM-DD',
      );
      query = query.andWhere('user.createdDate <= :toDate', {
        toDate,
      });
    }

    return await query
      .take(ObjectUtil.isEmpty(pagination) ? null : pagination.take)
      .skip(ObjectUtil.isEmpty(pagination) ? null : pagination.skip)
      .orderBy(order)
      .getManyAndCount();
  }

  private generateReferralCode(id: number) {
    return RandomUtil.generateRandomCode(8) + id;
  }

  private async verifyPassword(
    plainTextPassword: string,
    hashedPassword: string,
  ) {
    const isMatched = await bcrypt.compare(plainTextPassword, hashedPassword);
    return isMatched;
  }
}
