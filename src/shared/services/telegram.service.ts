import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "src/config/config.service";
import * as TG from "telegram";
import { generateRandomBytes, readBigIntFromBuffer } from "telegram/Helpers";
import { StringSession } from "telegram/sessions";

@Injectable()
export class TelegramService {
  // Need to update this, use .env
  
  // First we need to get Telegram:
  // 1. API_AI
  // 2. API_HASH
  // Then get the generated stringSession 
  // a. How to obtain stringSession
  // Please view https://github.com/mlyk1234/tg-stringHash-getter
  //
  // Reason to use stringSession: So that we do not need to reauthenticate with phone number everytime to connect

  stringSession = new StringSession(null)
  client: TG.TelegramClient | null = null 

  constructor(
    private readonly configService: ConfigService,
  ) {
    // Need to update this, use .env
    this.stringSession = new StringSession(this.configService.get('TG_SESSION_STRING'))
    const api_id = this.configService.get('TG_API_ID')
    const api_hash = this.configService.get('TG_API_HASH')
    this.client = new TG.TelegramClient(this.stringSession, Number(api_id), api_hash, {
      connectionRetries: 5,
    })
  }

  // private generateMessage(otp: any) {
  //   return `Your OTP code is ${otp}. The code is valid for 3 minutes.`
  // }

  // To send to user mobile phone number entered for telegram
  private async onGetUsername(mobileNumber: string): Promise<string> {
    try {
      const result = await this.client.invoke(new TG.Api.contacts.ImportContacts({
        contacts: [new TG.Api.InputPhoneContact({
          clientId: readBigIntFromBuffer(generateRandomBytes(8)),
          phone: mobileNumber,
          firstName: "Generic",
          lastName: "User_OTP"
        })]
      }))

      const tgUserDetails: any = result.users.find((a: any) => a.phone === mobileNumber.replace('+', '').toString());

      if (tgUserDetails.username) {
        return tgUserDetails.username 
      } else {
        throw Logger.error('[Telegram Service]: Username not available')
      }
    } catch (e) {
      console.log('Err - ', e);
    }
  }

  public async sendOtp(mobileNumber: string, message: string) {
    await this.client.connect();
    const username = await this.onGetUsername(mobileNumber)
    const sent = await this.client.sendMessage(`@${username}`, { message })
    // temporarily comment out disconnect for now because it create a lot of TIMEOUT error
    // until we found a fix
    // await this.client.disconnect()
  }
  // public async disconnect() {
  //   await this.client.disconnect();
  // }
}