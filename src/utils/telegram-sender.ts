import { Injectable } from "@nestjs/common";
import axios from 'axios';
import { ConfigService } from '../service/config.service';
import { getLogger } from './logger-factory';

let telegramConfig: TelegramConfig;

interface TelegramConfig {
  isConfigured: boolean;
  telegramApiKey: string;
  telegramChatId: string;
  telegramThreadId: string;
}

interface Data {
  chat_id: string;
  reply_to_message_id?: string;
  text: string;
  disable_notification: boolean;
}

@Injectable()
export class TelegramSender {
  logger = getLogger(`RestAPITelegramSender`);

  constructor(readonly msgPrefix: string) {}

  sendMessage(message: string) {
    if (!telegramConfig) {
      const telegramApiKey = ConfigService.getTelegramApiKey();
      const telegramChatId = ConfigService.getTelegramChatId();
      const telegramThreadId = ConfigService.getTelegramThreadId();
      telegramConfig =
        telegramApiKey && telegramChatId
          ? {
              telegramApiKey,
              telegramChatId,
              telegramThreadId,
              isConfigured: true,
            }
          : {
              telegramApiKey,
              telegramChatId,
              telegramThreadId,
              isConfigured: false,
            };
    }
    if (telegramConfig.isConfigured) {
      const data: Data = {
        chat_id: telegramConfig.telegramChatId,
        text: `${this.msgPrefix}: ${message}`,
        disable_notification: true,
      };
      if (telegramConfig.telegramThreadId) {
        data.reply_to_message_id = telegramConfig.telegramThreadId;
      }
      axios
        .post(
          `https://api.telegram.org/bot${telegramConfig.telegramApiKey}/sendMessage`,
          data,
        )
        .then(() => {})
        .catch((reason) => {
          this.logger.error('Telegram send failed', reason);
        });
    }
  }
}
