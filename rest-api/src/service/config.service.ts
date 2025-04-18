import * as process from 'node:process';
import { ChainSymbol, mainnet, NodeRpcUrls } from '@allbridge/bridge-core-sdk';
import { VERSION } from '@allbridge/bridge-core-sdk/dist/src/version';
import { Logger, LoggerCredential } from '@allbridge/logger';
import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { ConfigError } from '../error/errors';
import { getLogger as buildLogger } from '../utils/logger-factory';

dotenv.config();

const DEFAULT_PORT = 3000;

@Injectable()
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
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
      : {} as LoggerCredential;
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
    const networks = this.getNetworks() || Object.values(ChainSymbol);
    networks.forEach((chain) => {
      try {
        rpcUrls[chain] = ConfigService.getNetworkNodeUrl(chain);
        ConfigService.getLogger().log(
          `${chain} RPC Url loaded with ${rpcUrls[chain]}`,
        );
      } catch (ignoreError) { /* empty */ }
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

  static getNetworks(): string[] {
    return process.env.NETWORKS ? JSON.parse(process.env.NETWORKS) : [];
  }

  static getCoreApiHeaders() {
    return process.env.HEADERS
      ? Object.assign(JSON.parse(process.env.HEADERS), {
          'x-Rest-Agent': `AllbridgeCoreRestApi/${VERSION}`,
        })
      : { 'x-Rest-Agent': `AllbridgeCoreRestApi/${VERSION}` };
  }

  static getCoreApiQueryParams() {
    return process.env.CORE_API_QUERY_PARAMS
      ? JSON.parse(process.env.CORE_API_QUERY_PARAMS)
      : mainnet.coreApiQueryParams;
  }

  static getCoreApiUrl() {
    return process.env.CORE_API_URL
      ? process.env.CORE_API_URL
      : mainnet.coreApiUrl;
  }

  static getJupiterUrl() {
    return process.env.JUPITER_URL
      ? process.env.JUPITER_URL
      : mainnet.jupiterUrl;
  }

  static getJupiterApiKeyHeader() {
    return process.env.JUPITER_API_KEY_HEADER
      ? process.env.JUPITER_API_KEY_HEADER
      : mainnet.jupiterApiKeyHeader;
  }

  static getTronJsonRpc() {
    return process.env.TRON_JSON_RPC
      ? process.env.TRON_JSON_RPC
      : mainnet.tronJsonRpc;
  }

  static getJupiterMaxAccounts() {
    return process.env.JUPITER_MAX_ACCOUNTS
      ? +process.env.JUPITER_MAX_ACCOUNTS
      : mainnet.jupiterMaxAccounts;
  }

  static getWormholeMessengerProgramId() {
    return process.env.WORMHOLE_MESSENGER_PROGRAM_ID
      ? process.env.WORMHOLE_MESSENGER_PROGRAM_ID
      : mainnet.wormholeMessengerProgramId;
  }

  static getSolanaLookUpTable() {
    return process.env.SOLANA_LOOK_UP_TABLE
      ? process.env.SOLANA_LOOK_UP_TABLE
      : mainnet.solanaLookUpTable;
  }

  static getSorobanNetworkPassphrase() {
    return process.env.SOROBAN_NETWORK_PASSPHRASE
      ? process.env.SOROBAN_NETWORK_PASSPHRASE
      : mainnet.sorobanNetworkPassphrase;
  }

  static getCachePoolInfoChainSec() {
    return process.env.CACHE_POOL_INFO_CHAIN_SEC
      ? +process.env.CACHE_POOL_INFO_CHAIN_SEC
      : mainnet.cachePoolInfoChainSec;
  }

  static getCctpParams() {
    return process.env.CCTP_PARAMS
      ? JSON.parse(process.env.CCTP_PARAMS)
      : mainnet.cctpParams;
  }

  static getAdditionalChainsProperties() {
    return process.env.ADDITIONAL_CHAINS_PROPERTIES
      ? JSON.parse(process.env.ADDITIONAL_CHAINS_PROPERTIES)
      : mainnet.additionalChainsProperties;
  }
}
