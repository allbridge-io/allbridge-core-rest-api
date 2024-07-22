import { ChainSymbol, mainnet, NodeRpcUrls } from '@allbridge/bridge-core-sdk';
import { VERSION } from '@allbridge/bridge-core-sdk/dist/src/version';
import { Logger, LoggerCredential } from '@allbridge/logger';
import { Injectable } from '@nestjs/common';
import * as process from 'node:process';
import { ConfigError } from '../error/errors';
import * as dotenv from 'dotenv';
import { getLogger as buildLogger } from '../utils/logger-factory';

dotenv.config();

const DEFAULT_PORT = 3000;

@Injectable()
export class ConfigService {
  private static logger: Logger;

  static getLogger(): Logger {
    if (ConfigService.logger) {
      return ConfigService.logger;
    }
    ConfigService.logger = buildLogger('ConfigService');
    return ConfigService.logger;
  }

  static getPort(): number {
    return +(process.env.PORT || DEFAULT_PORT);
  }

  static getNetworkNodeUrl(chainSymbol: string): string {
    const nodeUrl = process.env[`${chainSymbol}_NODE_URL`];
    if (nodeUrl) {
      return nodeUrl;
    }
    throw new ConfigError(`${chainSymbol} node url not found`);
  }

  static getDebug(): boolean {
    return process.env.DEBUG === 'true';
  }

  static getLoggerCredential(): LoggerCredential {
    return process.env.LOGGER_CREDENTIAL
      ? JSON.parse(process.env.LOGGER_CREDENTIAL)
      : [];
  }

  static getTelegramApiKey(): string {
    return process.env.TELEGRAM_API_KEY ? process.env.TELEGRAM_API_KEY : '';
  }

  static getTelegramChatId(): string {
    return process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID : '';
  }

  static getTelegramThreadId(): string {
    return process.env.TELEGRAM_THREAD_ID ? process.env.TELEGRAM_THREAD_ID : '';
  }

  static getRPCUrls(): NodeRpcUrls {
    const rpcUrls: NodeRpcUrls = {};
    const chainSymbols = Object.values(ChainSymbol);
    chainSymbols.forEach((chain) => {
      try {
        rpcUrls[chain] = ConfigService.getNetworkNodeUrl(chain);
        ConfigService.getLogger().log(
          `${chain} RPC Url loaded with ${rpcUrls[chain]}`,
        );
      } catch (e) {}
    });
    if (!this.checkSRBandSTLRRpcUrlsBothPresence(rpcUrls)) {
      throw new ConfigError(`Requires SRB_NODE_URL and STLR_NODE_URL both`);
    }
    return rpcUrls;
  }

  private static checkSRBandSTLRRpcUrlsBothPresence(
    urls: NodeRpcUrls,
  ): boolean {
    const hasSRB = ChainSymbol.SRB in urls;
    const hasSTLR = ChainSymbol.STLR in urls;
    return hasSRB === hasSTLR;
  }

  static getSystemPrecision() {
    return process.env.SYSTEM_PRECISION ? +process.env.SYSTEM_PRECISION : 9;
  }

  static getCoreApiHeaders() {
    return process.env.HEADERS
      ? Object.assign(JSON.parse(process.env.HEADERS), {
          'x-Sdk-Agent': `AllbridgeCoreRestApi/${VERSION}`,
        })
      : { 'x-Sdk-Agent': `AllbridgeCoreRestApi/${VERSION}` };
  }

  static getJupiterUrl() {
    return process.env.JUPITER_URL
      ? process.env.JUPITER_URL
      : mainnet.jupiterUrl;
  }

  static getTronJsonRpc() {
    return process.env.TRON_JSON_RPC
      ? process.env.TRON_JSON_RPC
      : mainnet.tronJsonRpc;
  }
}
