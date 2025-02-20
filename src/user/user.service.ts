/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Brackets,
  DataSource,
  In,
  IsNull,
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
import { TxStatus, UserStatus } from 'src/shared/enum/status.enum';
import { Provider } from 'src/shared/enum/provider.enum';
import { UtilConstant } from 'src/shared/constants/util.constant';
import {
  TESTNET_CAMPAIGN_ID,
  TopAccountTestnet,
} from 'src/shared/constants/topAccountTestnet.constant';
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
import { keywords } from 'src/shared/constants/referralCodeKeyword.constant';
import { PointTxType, ReferralTxType } from 'src/shared/enum/txType.enum';
import { PointTx } from 'src/point/entities/point-tx.entity';
import { CampaignService } from 'src/campaign/campaign.service';
import { ClaimApproach } from 'src/shared/enum/campaign.enum';
import { ethers, formatEther, parseEther } from 'ethers';
import { ERC20, ERC20__factory } from 'src/contract';
import { QueueService } from 'src/queue/queue.service';
import { QueueName, QueueType } from 'src/shared/enum/queue.enum';
import { Job } from 'bullmq';
import { NotificationType } from 'src/shared/dto/admin-notification.dto';

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
export class UserService implements OnModuleInit {
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
    private campaignService: CampaignService,
    private queueService: QueueService,
  ) {
    this.telegramOTPBotUserName = this.configService.get(
      'TELEGRAM_OTP_BOT_USERNAME',
    );
    this.TG_LOGIN_WIDGET_BOT_TOKEN = this.configService.get(
      'TG_LOGIN_WIDGET_BOT_TOKEN',
    );
  }

  onModuleInit() {
    this.queueService.registerHandler(
      QueueName.TERMINATE,
      QueueType.RECALL_GAMEUSD,
      {
        jobHandler: this._recallGameUsd.bind(this),
        failureHandler: this._onTerminationFailed.bind(this),
      },
    );

    this.queueService.registerHandler(
      QueueName.TERMINATE,
      QueueType.RECALL_GAS,
      {
        jobHandler: this._recallGas.bind(this),
        failureHandler: this._onTerminationFailed.bind(this),
      },
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

    const pendingAmountResult = await this.dataSource.manager.query(
      `SELECT SUM(txAmount) as pendingAmount FROM wallet_tx
        WHERE
          userWalletId = ${result.wallet.id} AND
          txType IN ('REDEEM', 'PLAY', 'INTERNAL_TRANSFER') AND
          status IN ('P', 'PD', 'PA')`,
    );

    {
      const { id, updatedDate, userId, ...wallet } = result.wallet;
      result.wallet = wallet as UserWallet;
    }

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
      return { error: 'user.PHONENO_EXIST', data: null };
    }

    // check if referralCode valid
    let referralUserId = null;
    if (payload.referralCode !== null) {
      // const referralUser = await this.userRepository.findOne({
      //   where: { referralCode: payload.referralCode },
      //   relations: { wallet: true },
      // });
      const referralUser = await this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.wallet', 'wallet')
        .where('LOWER(user.referralCode) = LOWER(:referralCode)', {
          referralCode: payload.referralCode,
        })
        .getOne();
      if (!referralUser) {
        return { error: 'user.REFERAL_INVALID', data: null };
      }
      referralUserId = referralUser.id;
    }

    // check if last otp generated within 60 seconds
    if (user && user.otpGenerateTime) {
      if (await this.isOtpGeneratedWithin60Seconds(user.otpGenerateTime)) {
        return { error: 'user.OTP_GENERATED_WITHIN_60_SECONDS', data: null };
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
    //removes all falsy values from data
    //(username can be null, so we need to remove it before validating)
    const nonFalsyData = Object.keys(data).reduce((acc, key) => {
      if (data[key]) {
        acc[key] = data[key];
      }
      return acc;
    }, {});
    const dataCheckString = Object.keys(nonFalsyData)
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
        const newWalletWithId = await queryRunner.manager.save(newWallet);

        newUser.wallet = newWallet;
        newUser.referralCode = this.generateReferralCode(newUser.id);
        newUser.updatedBy = UtilConstant.SELF;
        await queryRunner.manager.save(newUser);

        if (newUser.referralUserId) {
          const referralTx = new ReferralTx();
          referralTx.rewardAmount = 0;
          referralTx.referralType = ReferralTxType.SET_REFERRAL;
          referralTx.bonusAmount = 0;
          referralTx.bonusCurrency = 'USDT';
          referralTx.status = TxStatus.SUCCESS;
          referralTx.txHash = null;
          referralTx.userId = newUser.id;
          referralTx.referralUserId = newUser.referralUserId;
          await queryRunner.manager.save(referralTx);

          await this.addReferralXp(newUser, queryRunner);
        }

        // validate if user eligible for point carry forward from alpha testnet to mainnet
        await this.validatePointCarryForward(
          'TG',
          newUser,
          newWalletWithId,
          queryRunner,
        );

        //Add address to deposit bot
        await axios.post(
          depositBotAddAddress,
          {
            address: walletAddress,
          },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const creditTx = await this.campaignService.executeClaim(
          ClaimApproach.SIGNUP,
          newUser.id,
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
        return { error: 'user.OTP_GENERATED_WITHIN_60_SECONDS', data: null };
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
      await this.updateFcmToken(user, payload.fcm);
      return { error: null, data: { tgUrl, ...user } };
    } else {
      // pass to handleGenerateOtpEvent() to generate and send otp
      this.eventEmitter.emit('user.service.otp', {
        userId: user.id,
        phoneNumber: user.phoneNumber,
      });
      await this.updateFcmToken(user, payload.fcm);
    }

    return { error: null, data: user };
  }

  async updateFcmToken(user: User, fcmToken: string): Promise<void> {
    if (!fcmToken || fcmToken.trim().length === 0) {
      return;
    }
    if (!user.fcm || user.fcm !== fcmToken) {
      console.log(`Updating FCM token for user ID: ${user.id}`);
      user.fcm = fcmToken;
      await this.userRepository.save(user);
    }
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
        return { error: 'user.WRONG_PHONE_NUMBER', data: null };
      }

      const { error } = await this.validateUserStatus(user);
      //ignore if user is pending or unverified
      if (
        error &&
        user.status != UserStatus.PENDING &&
        user.status != UserStatus.UNVERIFIED
      )
        return { error, data: null };

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
        const userWalletWithId = await queryRunner.manager.save(userWallet);

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
          referralTx.referralType = ReferralTxType.SET_REFERRAL;
          referralTx.bonusAmount = 0;
          referralTx.bonusCurrency = 'USDT';
          referralTx.status = TxStatus.SUCCESS;
          referralTx.txHash = null;
          referralTx.userId = user.id;
          referralTx.referralUserId = user.referralUserId;
          await queryRunner.manager.save(referralTx);

          await this.addReferralXp(user, queryRunner);
        }

        // validate if user eligible for point carry forward from alpha testnet to mainnet
        await this.validatePointCarryForward(
          'PhoneNumber',
          user,
          userWalletWithId,
          queryRunner,
        );

        //Add address to deposit bot
        await axios.post(
          depositBotAddAddress,
          {
            address: walletAddress,
          },
          { headers: { 'Content-Type': 'application/json' } },
        );

        const creditTx = await this.campaignService.executeClaim(
          ClaimApproach.SIGNUP,
          user.id,
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

  async terminateUser(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wallet'],
    });
    if (!user) {
      return { error: 'user.NOT_FOUND', data: null };
    }

    user.status = UserStatus.TERMINATED;
    await this.userRepository.save(user);

    const jobId = `terminate-${userId}`;
    this.queueService.addJob(QueueName.TERMINATE, jobId, {
      userId,
      queueType: QueueType.RECALL_GAMEUSD,
    });

    return { error: null, data: user };
  }

  private async addReferralXp(user: User, queryRunner: QueryRunner) {
    // Add 500 points to referrer
    const referrer = await queryRunner.manager.findOne(User, {
      where: { id: user.referralUserId },
      relations: ['wallet'],
    });

    const pointTx = new PointTx();
    pointTx.amount = 500; // 500 points for referral
    pointTx.walletId = referrer.wallet.id;
    pointTx.startingBalance = referrer.wallet.pointBalance;
    pointTx.endingBalance = Number(pointTx.startingBalance) + Number(500);
    pointTx.userWallet = referrer.wallet;
    pointTx.txType = PointTxType.QUEST;
    pointTx.taskId = 4;

    referrer.wallet.pointBalance = pointTx.endingBalance;
    await queryRunner.manager.save(pointTx);
    await queryRunner.manager.save(referrer.wallet);
  }

  private async _recallGameUsd(job: Job<{ userId: number }>) {
    const { userId } = job.data;

    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['wallet'],
      });
      if (!user.wallet) {
        //when the user account is still in pending status, wallet is not created yet
        return;
      }
      const signer = await this._getSigner(user.wallet.walletAddress);
      this.eventEmitter.emit(
        'gas.service.reload',
        user.wallet.walletAddress,
        this.configService.get('BASE_CHAIN_ID'),
      );
      const gameUsdContract = this.getTokenContract(
        this.configService.get('GAMEUSD_CONTRACT_ADDRESS'),
        signer,
      );
      const gameUsdBalance = await gameUsdContract.balanceOf(
        user.wallet.walletAddress,
      );
      if (gameUsdBalance > 0n) {
        await this.transferToken(
          gameUsdContract,
          this.configService.get('GAMEUSD_POOL_CONTRACT_ADDRESS'),
          gameUsdBalance,
        );
      }

      const jobId = `terminate-recall-gas-${userId}`;
      this.queueService.addJob(QueueName.TERMINATE, jobId, {
        userId,
        queueType: QueueType.RECALL_GAS,
      });
    } catch (error) {
      this.logger.error('Failed to recall gameUsd', error.stack);
      throw new Error('Failed to recall gameUsd');
    }
  }

  private async _recallGas(job: Job<{ userId: number }>) {
    const { userId } = job.data;
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['wallet'],
      });
      const signer = await this._getSigner(user.wallet.walletAddress);

      const opBnbBalance = await signer.provider.getBalance(signer.address);
      if (opBnbBalance > 0n && Number(formatEther(opBnbBalance)) > 0.001) {
        // const estimate = await signer.populateTransaction({
        //   to: this.configService.get('SUPPLY_ACCOUNT_ADDRESS'),
        //   value: '0',
        // });
        // console.log('estimate', estimate);
        // const gas = await signer.estimateGas({
        //   to: this.configService.get('SUPPLY_ACCOUNT_ADDRESS'),
        //   value: '0',
        // });
        // console.log('gas', gas);
        // const price = estimate.gasPrice;
        // const gasEstimate =
        //   gas *
        //   ethers.toBigInt(estimate.maxPriorityFeePerGas || estimate.gasLimit);
        // if (opBnbBalance > gasEstimate) {
        //   await signer.sendTransaction({
        //     to: this.configService.get('SUPPLY_ACCOUNT_ADDRESS'),
        //     value: opBnbBalance - gasEstimate,
        //     gasLimit: gas,
        //     gasPrice: estimate.gasPrice,
        //   });
        // }
        await signer.sendTransaction({
          to: this.configService.get('SUPPLY_ACCOUNT_ADDRESS'),
          value: opBnbBalance - ethers.parseEther('0.001'),
        });
      } else {
        await this.adminNotificationService.setAdminNotification(
          `Failed to recall gas for user ${userId}. Amount too low to recover.  
              \nAvailable ${formatEther(opBnbBalance)} `,
          'recallGasError',
          'Recall Gas Error',
          false,
        );
      }
    } catch (error) {
      console.log(error);
      console.log('message', error.message);
      // this.logger.error('Failed to recall gas', error.stack);
      throw new Error('Failed to recall gas');
    }
  }

  private async _onTerminationFailed(
    job: Job<{ userId: number }>,
    error: Error,
  ) {
    if (job.attemptsMade >= job.opts.attempts) {
      this.logger.error(
        `Recalling funds from terminated account ${job.data.userId} failed with error: ${error.message}`,
        error.stack,
      );
      await this.adminNotificationService.setAdminNotification(
        `Recalling funds from terminated account ${job.data.userId} failed with error: ${error.message}`,
        'terminationFailed',
        'Recall funds Failed',
        false,
      );
    }
  }

  private async _getSigner(walletAddress: string): Promise<ethers.Wallet> {
    try {
      const chainId = this.configService.get('BASE_CHAIN_ID');
      const providerUrl = this.configService.get(`PROVIDER_RPC_URL_${chainId}`);
      const provider = new ethers.JsonRpcProvider(providerUrl);
      const signer = new ethers.Wallet(
        await MPC.retrievePrivateKey(walletAddress),
        provider,
      );
      return signer;
    } catch (error) {
      this.logger.error('Failed to get signer', error.stack);
      throw new Error('Failed to get signer');
    }
  }

  private getTokenContract(tokenAddress: string, signer: ethers.Wallet) {
    return ERC20__factory.connect(tokenAddress, signer);
  }

  private async transferToken(
    tokenContract: ERC20,
    to: string,
    amount: bigint,
  ) {
    const gasLimit = await tokenContract.transfer.estimateGas(to, amount);
    return await tokenContract.transfer(to, amount, {
      gasLimit: gasLimit + (gasLimit * BigInt(30)) / BigInt(100),
    });
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
    // return RandomUtil.generateRandomCode(8) + id;
    const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
    return `fuyo${randomKeyword.toUpperCase()}${id}`;
  }

  private async verifyPassword(
    plainTextPassword: string,
    hashedPassword: string,
  ) {
    const isMatched = await bcrypt.compare(plainTextPassword, hashedPassword);
    return isMatched;
  }

  async getUserNotification(userId: number): Promise<UserNotification[]> {
    const notifications = await this.userNotificationRepository
      .createQueryBuilder('userNotification')
      .leftJoinAndSelect('userNotification.user', 'user')
      .leftJoinAndSelect('userNotification.notification', 'notification')
      .where('user.id = :userId', { userId })
      .andWhere(
        new Brackets((qb) => {
          qb.where('userNotification.channel = :inbox', {
            inbox: NotificationType.INBOX,
          }).orWhere('userNotification.channel IS NULL');
        }),
      )
      .select('userNotification')
      .addSelect('notification')
      .orderBy('userNotification.id', 'DESC')
      .getMany();

    return notifications;
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
          referralType: ReferralTxType.DEPOSIT,
        },
        {
          referralUserId: userId,
          referralType: ReferralTxType.BET,
        },
        {
          referralUserId: userId,
          referralType: ReferralTxType.PRIZE,
        },
        {
          referralUserId: userId,
          referralType: ReferralTxType.SET_REFERRAL,
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

  async validatePointCarryForward(
    signUpMethod: 'TG' | 'PhoneNumber',
    user: User,
    userWallet: UserWallet,
    queryRunner: QueryRunner,
  ) {
    const topAccount = TopAccountTestnet.find(
      (account) =>
        account.signUpMethod === signUpMethod &&
        account.accountValue ===
          (signUpMethod === 'TG' ? user.tgId.toString() : user.phoneNumber),
    );
    if (topAccount) {
      const pointTx = new PointTx();
      pointTx.txType = PointTxType.ADJUSTMENT;
      pointTx.amount = topAccount.pointAmount;
      pointTx.startingBalance = 0;
      pointTx.endingBalance = topAccount.pointAmount;
      pointTx.walletId = userWallet.id;
      pointTx.userWallet = userWallet;
      pointTx.campaignId = TESTNET_CAMPAIGN_ID;
      await queryRunner.manager.save(pointTx);

      userWallet.pointBalance = topAccount.pointAmount;
      await queryRunner.manager.save(userWallet);
    }
  }

  async updateWithdrawPin(
    userId: number,
    withdrawPin: string,
    oldPin?: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });
      if (!user) {
        throw new BadRequestException('User not found');
      }

      if (user.withdrawPin) {
        const isMatched = await bcrypt.compare(oldPin, user.withdrawPin);
        if (!isMatched) {
          throw new BadRequestException('Old pin is incorrect');
        }
      }

      const hash = await bcrypt.hash(withdrawPin, 10);
      await queryRunner.manager.update(
        User,
        { id: userId },
        {
          withdrawPin: hash,
        },
      );
      await queryRunner.commitTransaction();
    } catch (ex) {
      this.logger.error(ex);
      await queryRunner.rollbackTransaction();
      throw ex;
    } finally {
      if (!queryRunner.isReleased) await queryRunner.release();
    }
  }
}
