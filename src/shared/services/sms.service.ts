import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TwilioService } from 'nestjs-twilio';
import { ConfigService } from 'src/config/config.service';
import { Repository } from 'typeorm';
import { SmsLogs } from '../entities/sms-logs.entity';
import { SettingEnum } from '../enum/setting.enum';
import { CacheSettingService } from './cache-setting.service';
import { TelegramService } from './telegram.service';

@Injectable()
export class SMSService {
  private readonly logger = new Logger(SMSService.name);
  constructor(
    @Inject(forwardRef(() => TwilioService))
    private readonly twilioService: TwilioService,
    private readonly cacheSettingService: CacheSettingService,
    private configService: ConfigService,
    @InjectRepository(SmsLogs)
    private smsLogsRepository: Repository<SmsLogs>,
    private telegramService: TelegramService,
    ) {}

  private async sendSMS(mobileNumber, body) {
    const enableSMS = this.cacheSettingService.get(SettingEnum.ENABLE_SMS);
    console.log(enableSMS);
    if (enableSMS === 'Y') {
      try {
        const messageSid = this.cacheSettingService.get(
          SettingEnum.MESSAGE_SERVICE_SID,
        );

        const log = await this.smsLogsRepository.save(
          this.smsLogsRepository.create({
            apiRequest: JSON.stringify({
              messagingServiceSid: messageSid,
              to: mobileNumber,
              body,
            }),
          }),
        );

        const result = await this.twilioService.client.messages.create({
          messagingServiceSid: messageSid,
          to: mobileNumber,
          body,
        });

        await this.smsLogsRepository.update(log.id, {
          apiResponse: JSON.stringify(result),
        });
        return result;
      } catch (err) {
        this.logger.error(err);
        return null;
      }
    } else {
      return null;
    }
  }

  private async sendTelegram(mobileNumber: string, body: string) {
    await this.telegramService.sendOtp(mobileNumber, body);
  }

  async sendUserRegistrationOTP(
    mobileNumber: string,
    otpMethod: string,
    code: string
  ) {
    if (otpMethod === 'WHATSAPP') {
      // TODO

    } else if (otpMethod === 'TELEGRAM') {
      await this.sendTelegram(
        mobileNumber,
        `Please use the code - ${code} to verify your mobile number for ${this.configService.get(
          'APP_NAME',
        )} user registration.`,
      );

    } else { // otpMethod === 'SMS'
      await this.sendSMS(
        mobileNumber,
        `Please use the code - ${code} to verify your mobile number for ${this.configService.get(
          'APP_NAME',
        )} user registration.`,
      );
    }
  }
}
