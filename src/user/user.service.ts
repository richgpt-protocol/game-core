/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Brackets,
  DataSource,
  QueryRunner,
  Repository,
} from 'typeorm';
import {
  GetUsersDto,
  RegisterUserDto,
  SignInDto,
} from './dto/register-user.dto';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RandomUtil } from 'src/shared/utils/random.util';
import { UserStatus } from 'src/shared/enum/status.enum';
import { Provider } from 'src/shared/enum/provider.enum';
import { UtilConstant } from 'src/shared/constants/util.constant';
import { buildFilterCriterias } from 'src/shared/utils/pagination.util';
import { ObjectUtil } from 'src/shared/utils/object.util';
import { DateUtil } from 'src/shared/utils/date.util';

import axios from 'axios';
import { MPC } from 'src/shared/mpc';
import { UserWallet } from 'src/wallet/entities/user-wallet.entity';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AdminNotificationService } from 'src/shared/services/admin-notification.service';
import { ReferralTx } from 'src/referral/entities/referral-tx.entity';
import { SMSService } from 'src/shared/services/sms.service';
import { UserLoginDto, LoginWithTelegramDTO } from 'src/auth/dto/login.dto';
import { CacheSettingService } from 'src/shared/services/cache-setting.service';
import { SettingEnum } from 'src/shared/enum/setting.enum';
import { UserNotification } from 'src/notification/entities/user-notification.entity';
import { NotificationDto } from './dto/notification.dto';
import { Notification } from 'src/notification/entities/notification.entity';
import { WalletTx } from 'src/wallet/entities/wallet-tx.entity';
import { ConfigService } from 'src/config/config.service';
import { Setting } from 'src/setting/entities/setting.entity';
import { CreditService } from 'src/wallet/services/credit.service';
import { CreditWalletTx } from 'src/wallet/entities/credit-wallet-tx.entity';
import { GameUsdTx } from 'src/wallet/entities/game-usd-tx.entity';

const depositBotAddAddress = process.env.DEPOSIT_BOT_SERVER_URL;
type SetReferrerEvent = {
  txHash: string;
  referralTxId: number;
  userId: number;
};

type GenerateOtpEvent = {
  userId: number;
  phoneNumber?: string;
};

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  telegramOTPBotUserName: string;
  TG_LOGIN_WIDGET_BOT_TOKEN: string;
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(WalletTx)
    private walletTxRepository: Repository<WalletTx>,
    @InjectRepository(ReferralTx)
    private referralTxRepository: Repository<ReferralTx>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(UserNotification)
    private userNotificationRepository: Repository<UserNotification>,
    @InjectRepository(GameUsdTx)
    private gameUsdTxRepository: Repository<GameUsdTx>,
    private dataSource: DataSource,
    private eventEmitter: EventEmitter2,
    private adminNotificationService: AdminNotificationService,
    private smsService: SMSService,
    private cacheSettingService: CacheSettingService,
    private configService: ConfigService,
    private creditService: CreditService,
  ) {
    this.telegramOTPBotUserName = this.configService.get(
      'TELEGRAM_OTP_BOT_USERNAME',
    );
    this.TG_LOGIN_WIDGET_BOT_TOKEN = this.configService.get(
      'TG_LOGIN_WIDGET_BOT_TOKEN',
    );
  }

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
    if (!id)
      throw new Error('UserService.findOneWithoutHiddenFields() - id is null');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id },
      });
      return user;
    } catch (err) {
      throw new Error(err.message);
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
    // return await this.userRepository.findOneBy({
    //   id,
    // });
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

  async findByTgId(tgId: number) {
    const query = await this.userRepository
      .createQueryBuilder('row')
      .select('row')
      .addSelect('row.isReset')
      .addSelect('row.verificationCode')
      .addSelect('row.loginAttempt')
      .where({
        tgId,
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

  async getUserInfo(userId: number) {
    const {
      id,
      status,
      isReset,
      verificationCode,
      loginAttempt,
      isMobileVerified,
      otpGenerateTime,
      emailVerificationCode,
      updatedDate,
      updatedBy,
      referralUserId,
      withdrawPin,
      ...result
    } = await this.userRepository.findOne({
      where: { id: userId },
      relations: {
        wallet: true,
      },
    });

    {
      const { id, updatedDate, userId, ...wallet } = result.wallet;
      result.wallet = wallet as UserWallet;
    }

    const pendingAmountResult = await this.dataSource.manager.query(
      `SELECT SUM(txAmount) as pendingAmount FROM wallet_tx
        WHERE
          userWalletId = ${userId} AND
          txType IN ('REDEEM', 'PLAY', 'INTERNAL_TRANSFER') AND
          status IN ('P', 'PD', 'PA')`,
    );

    const pendingAmount = Number(pendingAmountResult[0]?.pendingAmount) || 0;
    const withdrawableBalance =
      pendingAmount >= result.wallet.walletBalance
        ? 0
        : result.wallet.walletBalance - pendingAmount;

    const response = {
      isWithdrawPasswordSet: !!withdrawPin,
      withdrawableBalance: Math.floor(withdrawableBalance * 100) / 100,
      ...result,
    };

    return response;
  }

  async register(payload: RegisterUserDto) {
    // check if phone exist
    let user = await this.userRepository.findOneBy({
      phoneNumber: payload.phoneNumber,
    });
    if (user && user.isMobileVerified) {
      // user && !user.isMobileVerified means user register but never success verified via otp
      return { error: 'phone number exist', data: null };
    }

    // check if referralCode valid
    let referralUserId = null;
    if (payload.referralCode !== null) {
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
      if (await this.isOtpGeneratedWithin60Seconds(user.otpGenerateTime)) {
        return { error: 'otp generated within 60 seconds', data: null };
      }
    }

    try {
      // create user record if not exist
      if (!user) {
        user = this.userRepository.create({
          ...payload, // phoneNumber, otpMethod
          uid: this.generateNumericUID(),
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

      if (payload.otpMethod == 'TELEGRAM') {
        const code = RandomUtil.generateRandomNumber(6);
        await this.update(user.id, {
          verificationCode: code,
          otpGenerateTime: new Date(),
        });

        const tgUrl = `https://t.me/${this.telegramOTPBotUserName}?start=${user.uid}`;

        return { error: null, data: { tgUrl, ...user } };
      } else {
        // pass to handleGenerateOtpEvent() to generate otp and send to user
        this.eventEmitter.emit('user.service.otp', {
          userId: user.id,
          phoneNumber: user.phoneNumber,
        });
      }

      // return user record
      return { error: null, data: user };
    } catch (err) {
      return { error: err.message, data: null };
    }
  }

  async validateTelegramPayload(tgId: string, hash: string, data: any) {
    const dataCheckString = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('\n');

    const secret = crypto
      .createHash('sha256')
      .update(this.TG_LOGIN_WIDGET_BOT_TOKEN)
      .digest();
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');

    if (hmac !== hash) {
      return { error: 'INVALID_HASH' };
    }

    return { error: null };
  }

  async validateUserStatus(user: User) {
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

    return { error: null };
  }

  async signInWithTelegram(
    payload: LoginWithTelegramDTO,
  ): Promise<{ error: string; data: User }> {
    console.log('signInWithTelegram', payload);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: {
          tgId: payload.id,
        },
        select: [
          'id',
          'status',
          'phoneNumber',
          'referralCode',
          'isMobileVerified',
        ],
      });

      if (user) {
        const { error } = await this.validateUserStatus(user);
        if (error) return { error, data: null };

        return { error: null, data: user };
      } else {
        //create new user

        let referralUserId = null;
        if (payload.referralCode && payload.referralCode != '') {
          const referralUser = await queryRunner.manager.findOne(User, {
            where: {
              referralCode: payload.referralCode,
            },
            relations: { wallet: true },
          });

          if (!referralUser)
            throw new BadRequestException('Invalid Referral Code');

          referralUserId = referralUser.id;
        }

        const newUser = new User();
        newUser.uid = this.generateNumericUID();
        newUser.referralCode = null;
        newUser.status = UserStatus.ACTIVE;
        newUser.isReset = false;
        newUser.verificationCode = null;
        newUser.loginAttempt = 0;
        newUser.isMobileVerified = true;
        newUser.otpGenerateTime = null;
        newUser.referralRank = 1;
        newUser.emailAddress = null;
        newUser.isEmailVerified = false;
        newUser.emailVerificationCode = null;
        newUser.emailOtpGenerateTime = null;
        newUser.updatedBy = null;
        newUser.referralUserId = referralUserId;
        newUser.referralTx = null;
        newUser.referredTx = null;
        newUser.wallet = null;
        newUser.tgId = payload.id;
        newUser.tgUsername = payload.username;
        await queryRunner.manager.save(newUser);

        const walletAddress = await MPC.createWallet();
        const newWallet = new UserWallet();
        newWallet.walletBalance = 0;
        newWallet.creditBalance = 0;
        newWallet.walletAddress = walletAddress;
        newWallet.pointBalance = 0;
        newWallet.userId = newUser.id;
        await queryRunner.manager.save(newWallet);

        newUser.wallet = newWallet;
        newUser.referralCode = this.generateReferralCode(newUser.id);
        newUser.updatedBy = UtilConstant.SELF;
        await queryRunner.manager.save(newUser);

        if (newUser.referralUserId) {
          const referralTx = new ReferralTx();
          referralTx.rewardAmount = 0;
          referralTx.referralType = 'SET_REFERRER';
          referralTx.bonusAmount = 0;
          referralTx.bonusCurrency = 'USDT';
          referralTx.status = 'S';
          referralTx.txHash = null;
          referralTx.userId = newUser.id;
          referralTx.referralUserId = newUser.referralUserId;
          await queryRunner.manager.save(referralTx);
        }

        //Add address to deposit bot
        await axios.post(
          depositBotAddAddress,
          {
            address: walletAddress,
          },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const creditTx = await this.processSignUpBonus(
          walletAddress,
          queryRunner,
        );

        if (creditTx) {
          await queryRunner.commitTransaction();

          await this.creditService.addToQueue(creditTx.id);

          return { error: null, data: newUser };
        }

        await queryRunner.commitTransaction();
        return { error: null, data: newUser };
      }
    } catch (error) {
      this.logger.error('error', error);
      await queryRunner.rollbackTransaction();

      await this.adminNotificationService.setAdminNotification(
        `Transaction in user.service.signInWithTelegram had been rollback, error: ${error}, telegramId: ${payload.id}`,
        'rollbackTxError',
        'Transaction Rollbacked',
        true,
      );
      const errorMessage =
        error instanceof BadRequestException ? error.message : 'Error Occurred';
      return { error: errorMessage, data: null };
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }

  async signIn(payload: SignInDto) {
    // check if user exist
    const user = await this.userRepository.findOneBy({
      phoneNumber: payload.phoneNumber,
    });
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
      if (await this.isOtpGeneratedWithin60Seconds(user.otpGenerateTime)) {
        return { error: 'otp generated within 60 seconds', data: null };
      }
    }

    // set user chosen otp method
    user.otpMethod = payload.otpMethod;
    await this.userRepository.save(user);

    if (payload.otpMethod == 'TELEGRAM') {
      const code = RandomUtil.generateRandomNumber(6);
      await this.update(user.id, {
        verificationCode: code,
        otpGenerateTime: new Date(),
      });

      const tgUrl = `https://t.me/${this.telegramOTPBotUserName}?start=${user.uid}`;

      return { error: null, data: { tgUrl, ...user } };
    } else {
      // pass to handleGenerateOtpEvent() to generate and send otp
      this.eventEmitter.emit('user.service.otp', {
        userId: user.id,
        phoneNumber: user.phoneNumber,
      });
    }

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
      // const code = RandomUtil.generateRandomNumber(6);
      let code = '';
      if (
        process.env.APP_ENV === 'dev' &&
        payload.phoneNumber === '+6587654321'
      ) {
        // temporarily for testing purpose
        code = '123456';
      } else {
        code = RandomUtil.generateRandomNumber(6);
      }
      await this.update(user.id, {
        verificationCode: code,
        otpGenerateTime: new Date(),
      });
      const phoneNumber = payload.phoneNumber ?? user.phoneNumber;
      // await this.smsService.sendUserRegistrationOTP(phoneNumber, user.otpMethod, code);
      if (
        process.env.APP_ENV === 'dev' &&
        payload.phoneNumber === '+6587654321'
      ) {
        // temporarily for testing purpose
        // do nothing
      } else {
        await this.smsService.sendUserRegistrationOTP(
          phoneNumber,
          user.otpMethod,
          code,
        );
      }
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

  async isOtpGeneratedWithin60Seconds(otpGenerateTime?: Date, userId?: number) {
    if (!otpGenerateTime) {
      const user = await this.userRepository.findOneBy({ id: userId });
      if (!user.otpGenerateTime) return false;
      otpGenerateTime = user.otpGenerateTime;
    }
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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const user = await queryRunner.manager
      .createQueryBuilder(User, 'user')
      .addSelect('user.isReset')
      .addSelect('user.verificationCode')
      .addSelect('user.loginAttempt')
      .where('user.phoneNumber = :phoneNumber', {
        phoneNumber: payload.phoneNumber,
      })
      .getOne();

    try {
      if (!user) {
        return { error: 'invalid phone number', data: null };
      }

      if (user.loginAttempt >= 3) {
        user.status = UserStatus.SUSPENDED;
        user.updatedBy = UtilConstant.SELF;
        await queryRunner.manager.save(user);
        await queryRunner.commitTransaction();
        return { error: 'user.EXCEED_LOGIN_ATTEMPT' };
      }

      if (user.verificationCode !== payload.code) {
        user.loginAttempt = user.loginAttempt + 1;
        user.updatedBy = UtilConstant.SELF;
        await queryRunner.manager.save(user);
        await queryRunner.commitTransaction();
        return { error: 'user.FAILED_VERIFY_OTP', data: null };
      }

      const otpExpiryTime = user.otpGenerateTime;
      otpExpiryTime.setMinutes(otpExpiryTime.getMinutes() + 1);
      if (DateUtil.compareDate(new Date(), otpExpiryTime) > 0) {
        return { error: 'user.OTP_EXPIRED', data: null };
      }

      user.verificationCode = null;
      user.otpGenerateTime = null;
      user.loginAttempt = 0;
      await queryRunner.manager.save(user);

      if (
        user.status === UserStatus.UNVERIFIED ||
        user.status === UserStatus.PENDING
      ) {
        const walletAddress = await MPC.createWallet();
        const userWallet = new UserWallet();
        userWallet.walletBalance = 0;
        userWallet.creditBalance = 0;
        userWallet.walletAddress = walletAddress;
        userWallet.pointBalance = 0;
        userWallet.userId = user.id;
        await queryRunner.manager.save(userWallet);

        user.wallet = userWallet;
        user.referralCode = this.generateReferralCode(user.id);
        user.status = UserStatus.ACTIVE;
        user.isMobileVerified = true;
        user.updatedBy = UtilConstant.SELF;
        await queryRunner.manager.save(user);

        // Handle referral logic if applicable
        if (user.referralUserId) {
          const referralTx = new ReferralTx();
          referralTx.rewardAmount = 0;
          referralTx.referralType = 'SET_REFERRER';
          referralTx.bonusAmount = 0;
          referralTx.bonusCurrency = 'USDT';
          referralTx.status = 'S';
          referralTx.txHash = null;
          referralTx.userId = user.id;
          referralTx.referralUserId = user.referralUserId;
          await queryRunner.manager.save(referralTx);
        }

        //Add address to deposit bot
        await axios.post(
          depositBotAddAddress,
          {
            address: walletAddress,
          },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const creditTx = await this.processSignUpBonus(
          userWallet.walletAddress,
          queryRunner,
        );

        if (creditTx) {
          await queryRunner.commitTransaction();

          await this.creditService.addToQueue(creditTx.id);

          return { error: null, data: user };
        }
      }

      await queryRunner.commitTransaction();
      return { error: null, data: user };
    } catch (err) {
      await queryRunner.rollbackTransaction();

      await this.userRepository.update(user.id, {
        status: UserStatus.PENDING,
        updatedBy: UtilConstant.SELF,
      });

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

  private async processSignUpBonus(
    walletAddress: string,
    queryRunner: QueryRunner,
  ): Promise<CreditWalletTx> {
    try {
      const signupBonusSetting = await queryRunner.manager.findOne(Setting, {
        where: {
          key: SettingEnum.ENABLE_SIGNUP_BONUS,
        },
      });

      if (signupBonusSetting) {
        this.eventEmitter.emit(
          'gas.service.reload',
          await walletAddress,
          this.configService.get('BASE_CHAIN_ID'),
        );
        const settingvalue = JSON.parse(signupBonusSetting.value);
        const timeNow = new Date().getTime() / 1000;
        const startDate = new Date(settingvalue.startTime * 1000);
        const endDate = new Date(settingvalue.endTime * 1000);
        const registrations = await queryRunner.manager.count(User, {
          where: {
            createdDate: Between(startDate, endDate),
            status: 'A',
          },
        });

        if (
          timeNow >= settingvalue.startTime &&
          timeNow <= settingvalue.endTime &&
          registrations <= settingvalue.noOfUsers
        ) {
          const creditTx = await this.creditService.addCreditQueryRunner(
            {
              amount: settingvalue.creditAmount,
              walletAddress: walletAddress,
            },
            queryRunner,
            false,
          );

          return creditTx;
        }
      }
    } catch (error) {
      this.logger.error(error);
      throw new Error(error.message);
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

  async getUserNotification(userId: number): Promise<UserNotification[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { userNotifications: true },
    });
    return user.userNotifications.reverse();
  }

  async setUserNotification(userId: number, _notification: NotificationDto) {
    try {
      const notification = this.notificationRepository.create({
        type: _notification.type,
        title: _notification.title,
        message: _notification.message,
      });
      if (_notification.walletTxId) {
        notification.walletTx = await this.walletTxRepository.findOneBy({
          id: _notification.walletTxId,
        });
      }

      if (_notification.gameUsdTxId) {
        notification.gameUsdTx = await this.gameUsdTxRepository.findOneBy({
          id: _notification.gameUsdTxId,
        });
      }
      await this.notificationRepository.save(notification);

      const userNotification = this.userNotificationRepository.create({
        user: await this.userRepository.findOneBy({ id: userId }),
        notification: notification,
      });
      await this.userNotificationRepository.save(userNotification);
    } catch (err) {
      this.logger.error(err);
    }
  }

  async updateUserNotification(userId: number) {
    await this.userNotificationRepository
      .createQueryBuilder()
      .update()
      .set({ isRead: true, readDateTime: new Date() })
      .where('user = :userId', { userId: userId })
      .andWhere('isRead = :isRead', { isRead: false })
      .execute();
  }

  async updateOtpMethod(userId: number, otpMethod: string) {
    await this.userRepository.update(userId, { otpMethod });
  }

  async getRefereePerformance(userId: number, count: number) {
    const referralTxs = await this.referralTxRepository.find({
      where: [
        {
          referralUserId: userId,
          referralType: 'DEPOSIT',
        },
        {
          referralUserId: userId,
          referralType: 'BET',
        },
        {
          referralUserId: userId,
          referralType: 'PRIZE',
        },
      ],
      relations: { user: true },
      order: { createdDate: 'DESC' },
      take: count,
    });

    return referralTxs.map((referralTx) => {
      return {
        uid: referralTx.user.uid,
        rewardAmount: referralTx.rewardAmount,
      };
    });
  }

  async getReferrer(code: string) {
    const {
      id,
      phoneNumber,
      otpGenerateTime,
      otpMethod,
      emailAddress,
      isEmailVerified,
      emailVerificationCode,
      emailOtpGenerateTime,
      createdDate,
      updatedDate,
      updatedBy,
      referralUserId,
      ...referrer
    } = await this.userRepository.findOneBy({ referralCode: code });
    return referrer;
  }

  generateNumericUID(): string {
    // Generate a random number and a timestamp
    const randomComponent = crypto.randomBytes(4).readUInt32BE(0); // 4 bytes to uint
    const timeComponent = Math.floor(Date.now() / 1000); // Current timestamp in seconds

    // Combine components
    const combined = `${timeComponent}${randomComponent}`;

    // Convert to a large number and slice to ensure specific length
    const hash = crypto.createHash('sha256').update(combined).digest('hex');
    const bigIntHash = BigInt('0x' + hash);

    // Convert to string and take the last 10 digits for the UID
    const uid = bigIntHash.toString().slice(-10);

    return uid;
  }
}
