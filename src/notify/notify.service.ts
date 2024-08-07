import { Injectable } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { ConfigService } from 'src/config/config.service';

@Injectable()
export class NotifyService {
  private bot: TelegramBot;
  private tg_admins: Array<string>;
  constructor(private configService: ConfigService) {
    this.tg_admins = this.configService.get('ADMIN_TG_USERNAMES').split(',');
    this.bot = new TelegramBot(
      this.configService.get('TG_ADMIN_NOTIFIER_BOT_TOKEN'),
      {
        polling: true,
      },
    );

    console.log('Notifier service initialized');

    // this.bot.on('message', (msg: TelegramBot.Message) => {
    //   console.log('Received message', msg);
    // });

    this.bot.on('callback_query', async (query) => {
      await this._handleCallbackQuery(query);
    });
  }

  async notify(chatIds: Array<string>, message: string) {
    try {
      for (const chatId of chatIds) {
        await this.bot.sendMessage(chatId, message);
      }
    } catch (error) {
      console.error('Error while sending message to telegram', error);
    }
  }

  //@dev Used by claim-rewards service to notify admin about claim request
  async NotifyClaimRequestAdmin(
    chatId: string,
    dataMsg: Array<{ message: string; data: { id: number } }>,
  ) {
    try {
      for (const { message, data } of dataMsg) {
        const buttons = [
          {
            text: 'Approve',
            //Using 2 letters because of 64 bytes limit in callback_data
            //status: approve, id: data.id
            callback_data: JSON.stringify({ s: 'a', id: data.id }),
          },
          {
            text: 'Reject',
            callback_data: JSON.stringify({ s: 'r', id: data.id }), //status: reject, id: data.id
          },
        ];
        await this._sendInlineKeyboard(chatId, message, buttons);
      }
    } catch (error) {
      console.error('Error while sending message to telegram', error);
    }
  }

  //@dev Triggered when admin clicks on approve/reject button in TG
  private async _handleCallbackQuery(query: TelegramBot.CallbackQuery) {
    try {
      const botInfo = await this.bot.getMe();

      //Initial message should be from bot, ignore other messages
      if (query.message.from.id != botInfo.id) {
        return;
      }

      const admins = this.tg_admins;
      if (!admins.includes(query.from.username)) {
        await this.bot.answerCallbackQuery(query.id, {
          text: 'You are not authorized to perform this action',
          callback_query_id: query.id,
        });
        return;
      }

      if (query.message.chat.id.toString() !== process.env.ADMIN_TG_CHAT_ID) {
        // ignore callback query from other chats
        return;
      }

      await this.bot.answerCallbackQuery(query.id, {
        text: `Processing`,
        callback_query_id: query.id,
      });

      const data = JSON.parse(query.data);
      let buttonText = '';
      if (data.s === 'a') {
        buttonText = 'Approved';
        // await this.claimRewardsService.updateClaimTxStatusByAdmin(
        //   data.id,
        //   ClaimStatus.APPROVED,
        // );
      } else if (data.s === 'r') {
        buttonText = 'Rejected';
        // await this.claimRewardsService.updateClaimTxStatusByAdmin(
        //   data.id,
        //   ClaimStatus.REJECTED,
        // );
      } else {
        return;
      }

      // Update the message with the completed Action
      const newButtons = [{ text: buttonText, callback_data: 'empty' }];
      await this.bot.editMessageReplyMarkup(
        {
          inline_keyboard: [newButtons],
        },
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        },
      );

      //await this.bot.deleteMessage(query.message.chat.id, query.message.message_id);
    } catch (error) {
      console.error('Error while handling callback query', error);
    }
  }

  private async _sendInlineKeyboard(
    chatId: string,
    message: string,
    buttons: Array<{ text: string; callback_data: any }>,
  ) {
    try {
      await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [buttons],
        },
      });
    } catch (error) {
      console.error('Error while sending message to telegram', error);
    }
  }
}
