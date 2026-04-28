import {
  AllbridgeCoreSdk,
  AmountFormat,
  AmountFormatted,
  BridgeApproveParams,
  ChainDetailsMap,
  ChainSymbol,
  ChainType,
  CheckAllowanceParams,
  CYDToken,
  ExtraGasMaxLimitResponse,
  GasBalanceResponse,
  GasFeeOptions,
  GetAllowanceParams,
  GetNativeTokenBalanceParams,
  GetTokenBalanceParams,
  LiquidityPoolsApproveParams,
  LiquidityPoolsParams,
  LiquidityPoolsParamsWithAmount,
  mainnet,
  Messenger,
  PendingStatusInfoResponse,
  PoolInfo,
  RawAlgTransaction,
  RawBridgeSolanaTransaction,
  RawPoolSolanaTransaction,
  RawTransaction,
  SendParams,
  SwapParams,
  TokenWithChainDetails,
  TokenWithChainDetailsYield,
  TransferStatusResponse,
  UserBalanceInfo,
  YieldApproveParams,
  YieldCheckAllowanceParams,
  YieldDepositParams,
  YieldGetAllowanceParams,
  YieldGetEstimatedAmountOnDepositParams,
  YieldGetWithdrawProportionAmountParams,
  YieldBalanceParams,
  YieldWithdrawAmount,
  YieldWithdrawParams,
} from '@allbridge/bridge-core-sdk';
import { TransactionResult } from '@mysten/sui/transactions';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Connection as solanaWeb3Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { Horizon, rpc as SorobanRpc } from "@stellar/stellar-sdk";
import { AxiosHeaders } from 'axios';

import { Big } from 'big.js';
import { getRequestClientIp, getRequestHeaders } from '../utils/request-context';
import { normalizeRequestHeaders } from '../utils/request-headers';
import { sponsorWrapRawTx } from '../utils/solana';
import { raw2base64 } from '../utils/sui';
import { raw2hex } from '../utils/tron';
import { ConfigService } from './config.service';

export enum SolanaTxFeeParamsMethod {
  AUTO = 'AUTO',
  PRICE_PER_UNIT_IN_MICRO_LAMPORTS = 'pricePerUnitInMicroLamports',
  EXTRA_FEE_IN_LAMPORTS = 'extraFeeInLamports',
}

export interface BridgeAmounts {
  amountInFloat: string;
  amountReceivedInFloat: string;
}


export interface SwapCalcInfo {
  
  sourceLiquidityFee: string;

  
  sourceSwap: string;

  
  destinationLiquidityFee: string;

  
  destinationSwap: string;
}

export interface TransferAmountData {
  sourceViewAmount: string | number;
  expectedVirtualViewAmount: string | number;
  expectedDestinationViewAmount: string | number;
  stableFeeInFloat: string | undefined;
}

@Injectable()
export class SDKService {
  sdk: AllbridgeCoreSdk;
  private _chainDetailsMap: Partial<Record<'swap' | 'pool', ChainDetailsMap>> = {};

  constructor() {
    this.sdk = new AllbridgeCoreSdk(ConfigService.getRPCUrls(), {
      ...mainnet,
      coreApiUrl: ConfigService.getCoreApiUrl(),
      coreApiQueryParams: ConfigService.getCoreApiQueryParams(),
      coreApiHeaders: ConfigService.getCoreApiHeaders(),
      jupiterUrl: ConfigService.getJupiterUrl(),
      jupiterApiKeyHeader: ConfigService.getJupiterApiKeyHeader(),
      jupiterMaxAccounts: ConfigService.getJupiterMaxAccounts(),
      wormholeMessengerProgramId: ConfigService.getWormholeMessengerProgramId(),
      solanaLookUpTable: ConfigService.getSolanaLookUpTable(),
      sorobanNetworkPassphrase: ConfigService.getSorobanNetworkPassphrase(),
      tronJsonRpc: ConfigService.getTronJsonRpc(),
      cctpParams: ConfigService.getCctpParams(),
      cachePoolInfoChainSec: ConfigService.getCachePoolInfoChainSec(),
      additionalChainsProperties: ConfigService.getAdditionalChainsProperties(),
      stxIsTestnet: ConfigService.getStxIsTestnet(),
      stxHeroApiKey: ConfigService.getStxHeroApiKey(),
    });

    this.attachCoreApiHeadersInterceptor();
  }

  private formatErrorForLog(error: unknown): Record<string, unknown> {
    if (!(error instanceof Error)) {
      return { error };
    }

    const errorWithExtras = error as Error & {
      code?: string;
      errorCode?: string;
      response?: {
        status?: number;
        data?: unknown;
      };
    };

    return {
      name: error.name,
      message: error.message,
      code: errorWithExtras.code,
      errorCode: errorWithExtras.errorCode,
      responseStatus: errorWithExtras.response?.status,
      responseData: errorWithExtras.response?.data,
    };
  }

  private attachCoreApiHeadersInterceptor(): void {
    const coreApiTransport = (this.sdk as any)
      ?.service
      ?.api
      ?.client
      ?.client
      ?.apiClient
      ?.apiClient
      ?.api;

    if (!coreApiTransport?.interceptors?.request) {
      throw new Error('Cannot access SDK core API transport');
    }

    coreApiTransport.interceptors.request.use((config: any) => {
      const headers = AxiosHeaders.from(config.headers);
      const requestHeaders = getRequestHeaders();
      if (requestHeaders) {
        const normalizedHeaders = normalizeRequestHeaders(requestHeaders);
        for (const [headerName, headerValue] of Object.entries(normalizedHeaders)) {
          headers.set(headerName, headerValue);
        }
      }

      const clientIp = getRequestClientIp();
      if (clientIp) {
        headers.set('x-forwarded-for', clientIp);
      }

      headers.set('x-Rest-Agent', ConfigService.getCoreApiHeaders()['x-Rest-Agent']);
      config.headers = headers;
      return config;
    });
  }

  async getTokens(type?: 'swap' | 'pool'): Promise<TokenWithChainDetails[]> {
    return await this.sdk.tokens(type);
  }

  async getTokensByChain(
    chainSymbol: ChainSymbol,
    type?: 'swap' | 'pool',
  ): Promise<TokenWithChainDetails[]> {
    return await this.sdk.tokensByChain(chainSymbol, type);
  }

  async chainDetailsMap(type?: 'swap' | 'pool'): Promise<ChainDetailsMap> {
    const mapType = type ?? 'swap';
    if (!this._chainDetailsMap[mapType]) {
      this._chainDetailsMap[mapType] = await this.sdk.chainDetailsMap(type);
    }
    return this._chainDetailsMap[mapType];
  }

  getTransferTime(
    sourceToken: TokenWithChainDetails,
    destinationToken: TokenWithChainDetails,
    messenger: Messenger,
  ): number | null {
    return this.sdk.getAverageTransferTime(
      sourceToken,
      destinationToken,
      messenger,
    );
  }

  getTokenBalance(params: GetTokenBalanceParams): Promise<string> {
    return this.sdk.getTokenBalance(params);
  }

  getNativeTokenBalance(
    params: GetNativeTokenBalanceParams,
  ): Promise<AmountFormatted> {
    return this.sdk.getNativeTokenBalance(params);
  }

  async getTokenByChainAndAddress(
    chainSymbol: ChainSymbol,
    tokenAddress: string,
  ): Promise<TokenWithChainDetails | undefined> {
    if (!tokenAddress) {
      return undefined;
    }

    const normalizedAddress = tokenAddress.toUpperCase();
    const tokens = await this.sdk.tokensByChain(chainSymbol);
    return tokens.find(
      (token) =>
        token.tokenAddress?.toUpperCase() === normalizedAddress
        || token.poolAddress?.toUpperCase() === normalizedAddress,
    );
  }

  async getAnyTokenByAddress(
    tokenAddress: string,
  ): Promise<TokenWithChainDetails | TokenWithChainDetailsYield | CYDToken | undefined> {
    if (!tokenAddress) {
      return undefined;
    }

    const normalizedAddress = tokenAddress.toUpperCase();

    const swapToken = await this.getTokenByAddress(tokenAddress, 'swap');
    if (swapToken) {
      return swapToken;
    }

    const poolToken = await this.getTokenByAddress(tokenAddress, 'pool');
    if (poolToken) {
      return poolToken;
    }

    const cydTokens = await this.getCYDTokens();
    const cydToken = cydTokens.find(
      (token) => token.yieldAddress?.toUpperCase() === normalizedAddress,
    );
    if (cydToken) {
      return cydToken;
    }

    return cydTokens.flatMap((token) => token.tokens).find(
      (token) =>
        token.tokenAddress?.toUpperCase() === normalizedAddress
        || token.poolAddress?.toUpperCase() === normalizedAddress,
    );
  }

  async getAnyTokenByChainAndAddress(
    chainSymbol: ChainSymbol,
    tokenAddress: string,
  ): Promise<TokenWithChainDetails | TokenWithChainDetailsYield | CYDToken | undefined> {
    if (!tokenAddress) {
      return undefined;
    }

    const normalizedAddress = tokenAddress.toUpperCase();

    const swapToken = await this.getTokenByChainAndAddress(chainSymbol, tokenAddress);
    if (swapToken) {
      return swapToken;
    }

    const poolTokens = await this.getTokensByChain(chainSymbol, 'pool');
    const poolToken = poolTokens.find(
      (token) =>
        token.tokenAddress?.toUpperCase() === normalizedAddress
        || token.poolAddress?.toUpperCase() === normalizedAddress,
    );
    if (poolToken) {
      return poolToken;
    }

    const cydTokens = await this.getCYDTokens();
    const cydToken = cydTokens.find(
      (token) =>
        token.chainSymbol === chainSymbol
        && token.yieldAddress?.toUpperCase() === normalizedAddress,
    );
    if (cydToken) {
      return cydToken;
    }

    return cydTokens
      .filter((token) => token.chainSymbol === chainSymbol)
      .flatMap((token) => token.tokens)
      .find(
        (token) =>
          token.tokenAddress?.toUpperCase() === normalizedAddress
          || token.poolAddress?.toUpperCase() === normalizedAddress,
      );
  }

  async getGasFeeOptions(
    sourceChainToken: TokenWithChainDetails,
    destinationChainToken: TokenWithChainDetails,
    messenger: Messenger,
  ): Promise<GasFeeOptions> {
    return this.sdk.getGasFeeOptions(
      sourceChainToken,
      destinationChainToken,
      messenger,
    );
  }

  async getExtraGasMaxLimits(
    sourceChainToken: TokenWithChainDetails,
    destinationChainToken: TokenWithChainDetails,
    messenger?: Messenger,
  ): Promise<ExtraGasMaxLimitResponse> {
    return this.sdk.getExtraGasMaxLimits(
      sourceChainToken,
      destinationChainToken,
      messenger,
    );
  }

  async getGasBalance(
    chain: ChainSymbol,
    address: string,
  ): Promise<GasBalanceResponse> {
    return this.sdk.getGasBalance(chain, address);
  }

  async checkBalanceLine(
    address: string,
    tokenAddress: string,
  ): Promise<Horizon.HorizonApi.BalanceLineAsset> {
    return await this.sdk.utils.srb.getBalanceLine(address, tokenAddress);
  }

  async checkAssetOptIn(
    sender: string,
    assetId: string,
  ): Promise<boolean> {
    return await this.sdk.utils.alg.checkAssetOptIn(assetId, sender);
  }

  async checkAppOptIn(
    sender: string,
    appId: string,
  ): Promise<boolean> {
    return await this.sdk.utils.alg.checkAppOptIn(appId, sender);
  }

  async buildRawTransactionAssetOptIn(
    assetId: string,
    sender: string,
  ): Promise<RawAlgTransaction> {
    return await this.sdk.utils.alg.buildRawTransactionAssetOptIn(assetId, sender);
  }

  async buildRawTransactionAppOptIn(
    appId: string,
    sender: string,
  ): Promise<RawAlgTransaction> {
    return await this.sdk.utils.alg.buildRawTransactionAppOptIn(appId, sender);
  }

  async getPendingStatusInfo(
    amount: string,
    format: AmountFormat,
    sourceToken: TokenWithChainDetails,
    destinationToken: TokenWithChainDetails,
  ): Promise<PendingStatusInfoResponse> {
    return this.sdk.getPendingStatusInfo(
      amount,
      format,
      sourceToken,
      destinationToken,
    );
  }

  async send(params: SwapParams | SendParams, outputFormat: 'json' | 'base64' | 'hex' = 'json'): Promise<RawTransaction> {
    const rawTx = await this.sdk.bridge.rawTxBuilder.send(params);
    if (params.sourceToken.chainSymbol === ChainSymbol.SOL) {
      return Buffer.from(
        (
          rawTx as RawBridgeSolanaTransaction | RawPoolSolanaTransaction
        ).serialize(),
      ).toString('hex');
    }
    if (params.sourceToken.chainSymbol === ChainSymbol.SUI && outputFormat === 'base64') {
      return await raw2base64(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.SUI.toString()));
    }
    if (params.sourceToken.chainSymbol === ChainSymbol.TRX && outputFormat === 'hex') {
      return await raw2hex(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.TRX.toString()));
    }
    return rawTx;
  }

  refreshPoolInfo(
    tokens?: TokenWithChainDetails | TokenWithChainDetails[],
  ): Promise<void> {
    return this.sdk.refreshPoolInfo(tokens);
  }

  async getPoolInfoFromServer(token: TokenWithChainDetails): Promise<PoolInfo> {
    return this.sdk.getPoolInfoByToken(token);
  }

  async getPoolInfoFromBlockchain(
    token: TokenWithChainDetails,
  ): Promise<Required<PoolInfo>> {
    return this.sdk.pool.getPoolInfoFromChain(token);
  }

  async getPoolAllowance(params: GetAllowanceParams): Promise<string> {
    if (params.token.chainType !== ChainType.EVM && params.token.chainType !== ChainType.TRX) {
      throw new HttpException('This operation is only available for EVM-based blockchains.', HttpStatus.BAD_REQUEST);
    }
    return this.sdk.pool.getAllowance(params);
  }

  async checkPoolAllowance(params: CheckAllowanceParams): Promise<boolean> {
    if (params.token.chainType !== ChainType.EVM && params.token.chainType !== ChainType.TRX) {
      throw new HttpException('This operation is only available for EVM-based blockchains.', HttpStatus.BAD_REQUEST);
    }
    return this.sdk.pool.checkAllowance(params);
  }

  async getBridgeAllowance(params: GetAllowanceParams): Promise<string> {
    if (params.token.chainType !== ChainType.EVM && params.token.chainType !== ChainType.TRX) {
      throw new HttpException('This operation is only available for EVM-based blockchains.', HttpStatus.BAD_REQUEST);
    }
    return this.sdk.bridge.getAllowance(params);
  }

  async checkBridgeAllowance(params: CheckAllowanceParams): Promise<boolean> {
    if (params.token.chainType !== ChainType.EVM && params.token.chainType !== ChainType.TRX) {
      throw new HttpException('This operation is only available for EVM-based blockchains.', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdk.bridge.checkAllowance(params);
    } catch (e) {
      console.error('Error in checkBridgeAllowance', {
        owner: params.owner,
        tokenAddress: params.token.tokenAddress,
        chainSymbol: params.token.chainSymbol,
        chainId: params.token.chainId,
        gasFeePaymentMethod: params.gasFeePaymentMethod,
        error: this.formatErrorForLog(e),
      });
      throw e;
    }
  }

  async getUserPoolInfo(
    account: string,
    token: TokenWithChainDetails,
  ): Promise<UserBalanceInfo> {
    return this.sdk.pool.getUserBalanceInfo(account, token);
  }

  async poolApprove(params: LiquidityPoolsApproveParams): Promise<RawTransaction> {
    if (params.token.chainType !== ChainType.EVM && params.token.chainType !== ChainType.TRX) {
      throw new HttpException('This operation is only available for EVM-based blockchains.', HttpStatus.BAD_REQUEST);
    }
    return this.sdk.pool.rawTxBuilder.approve(params);
  }

  async bridgeApprove(params: BridgeApproveParams): Promise<RawTransaction> {
    if (params.token.chainType !== ChainType.EVM && params.token.chainType !== ChainType.TRX) {
      throw new HttpException('This operation is only available for EVM-based blockchains.', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdk.bridge.rawTxBuilder.approve(params);
    } catch (e) {
      console.error('Error in bridgeApprove', {
        owner: params.owner,
        tokenAddress: params.token.tokenAddress,
        chainSymbol: params.token.chainSymbol,
        chainId: params.token.chainId,
        messenger: params.messenger,
        gasFeePaymentMethod: params.gasFeePaymentMethod,
        error: this.formatErrorForLog(e),
      });
      throw e;
    }
  }

  async deposit(
    params: LiquidityPoolsParamsWithAmount,
  ): Promise<RawTransaction> {
    return this.sdk.pool.rawTxBuilder.deposit(params);
  }

  async withdraw(
    params: LiquidityPoolsParamsWithAmount,
  ): Promise<RawTransaction> {
    return this.sdk.pool.rawTxBuilder.withdraw(params);
  }

  async claimRewards(params: LiquidityPoolsParams): Promise<RawTransaction> {
    return this.sdk.pool.rawTxBuilder.claimRewards(params);
  }

  async getAmountToBeDeposited(
    amount: string,
    token: TokenWithChainDetails,
  ): Promise<string> {
    return this.sdk.pool.getAmountToBeDeposited(amount, token);
  }

  async getAmountToBeWithdrawn(
    amount: string,
    owner: string,
    token: TokenWithChainDetails,
  ): Promise<string> {
    return this.sdk.pool.getAmountToBeWithdrawn(amount, owner, token);
  }

  async getVUsdFromAmount(
    amount: string,
    amountFormat: AmountFormat,
    sourceToken: TokenWithChainDetails,
  ): Promise<AmountFormatted> {
    return this.sdk.getVUsdFromAmount(amount, amountFormat, sourceToken);
  }

  async getAmountFromVUsd(
    vUsdAmount: string,
    destinationToken: TokenWithChainDetails,
  ): Promise<AmountFormatted> {
    return this.sdk.getAmountFromVUsd(vUsdAmount, destinationToken);
  }

  aprInPercents(apr: string): string {
    return this.sdk.aprInPercents(apr);
  }

  async getAmountToBeReceived(
    amountFloat: string,
    sourceToken: TokenWithChainDetails,
    destinationToken: TokenWithChainDetails,
    messenger: Messenger,
    refreshingPool = false,
    stableFeeInFloat?: string,
  ): Promise<BridgeAmounts> {
    if (refreshingPool) {
      await this.refreshPoolInfo([sourceToken, destinationToken]);
    }
    try {
      const amountToSendFloat = stableFeeInFloat
        ? Big(amountFloat)
        .minus(stableFeeInFloat)
        .round(sourceToken.decimals)
        .toFixed()
        : amountFloat;
      if (Big(amountToSendFloat).lte(0)) {
        return { amountInFloat: amountFloat, amountReceivedInFloat: '' };
      }
      let amountReceived: string;
      if (
        refreshingPool &&
        sourceToken.chainSymbol === destinationToken.chainSymbol
      ) {
        amountReceived = await this.sdk.getAmountToBeReceivedFromChain(
          amountToSendFloat,
          sourceToken,
          destinationToken,
          messenger,
        );
      } else {
        amountReceived = await this.sdk.getAmountToBeReceived(
          amountToSendFloat,
          sourceToken,
          destinationToken,
          messenger,
        );
      }
      return {
        amountInFloat: amountFloat,
        amountReceivedInFloat: amountReceived,
      };
    } catch (e: any) {
      console.error('Error in getAmountToBeReceived', {
        sourceToken: sourceToken.tokenAddress,
        destinationToken: destinationToken.tokenAddress,
        messenger,
        refreshingPool,
        error: this.formatErrorForLog(e),
      });
      return { amountInFloat: amountFloat, amountReceivedInFloat: '' };
    }
  }

  async getAmountToSend(
    amountReceivedFloat: string,
    sourceToken: TokenWithChainDetails,
    destinationToken: TokenWithChainDetails,
    messenger?: Messenger,
    refreshingPool = false,
    stableFeeInFloat?: string,
  ): Promise<BridgeAmounts> {
    if (refreshingPool) {
      await this.refreshPoolInfo([sourceToken, destinationToken]);
    }
    let amount;
    try {
      const roundedAmountReceived = Big(amountReceivedFloat)
      .round(destinationToken.decimals)
      .toFixed();
      if (
        refreshingPool &&
        sourceToken.chainSymbol === destinationToken.chainSymbol
      ) {
        amount = await this.sdk.getAmountToSendFromChain(
          roundedAmountReceived,
          sourceToken,
          destinationToken,
          messenger,
        );
      } else {
        amount = await this.sdk.getAmountToSend(
          roundedAmountReceived,
          sourceToken,
          destinationToken,
          messenger,
        );
      }
    } catch (e: any) {
      console.error('Error in getAmountToSend', {
        sourceToken: sourceToken.tokenAddress,
        destinationToken: destinationToken.tokenAddress,
        messenger,
        refreshingPool,
        error: this.formatErrorForLog(e),
      });
      return { amountInFloat: '', amountReceivedInFloat: amountReceivedFloat };
    }
    const amountInFloat = stableFeeInFloat
      ? Big(amount).plus(stableFeeInFloat)
      : Big(amount);
    return {
      amountInFloat: amountInFloat
      .round(sourceToken.decimals, Big.roundUp)
      .toFixed(),
      amountReceivedInFloat: amountReceivedFloat,
    };
  }

  async swapAndBridgeDetails(
    amount: string,
    amountFormat: AmountFormat,
    sourceToken: TokenWithChainDetails,
    destToken: TokenWithChainDetails,
  ): Promise<SwapCalcInfo> {
    const isValidAmount = !(!amount || isNaN(+amount) || Big(amount).eq('0'));
    const { sourceLPSwap, destLPSwap } = await this.sdk.getSendAmountDetails(
      isValidAmount ? Big(amount).round(sourceToken.decimals).toFixed() : '0',
      amountFormat,
      sourceToken,
      destToken,
    );
    return {
      sourceLiquidityFee: sourceLPSwap.fee,
      sourceSwap: sourceLPSwap.swap,
      destinationLiquidityFee: destLPSwap.fee,
      destinationSwap: destLPSwap.swap,
    };
  }

  async simulateAndCheckRestoreTxRequiredSoroban(
    xdrTx: string,
    sourceAccount: string,
  ): Promise<string> {
    return await this.sdk.utils.srb.simulateAndCheckRestoreTxRequiredSoroban(
      xdrTx,
      sourceAccount,
    );
  }

  async buildChangeTrustLineXdrTx(params: {
    sender: string;
    tokenAddress: string;
    limit?: string;
  }): Promise<string> {
    return await this.sdk.utils.srb.buildChangeTrustLineXdrTx(params);
  }

  async submitTransactionStellar(
    xdrTx: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    return await this.sdk.utils.srb.submitTransactionStellar(xdrTx);
  }

  async sendTransactionSoroban(
    xdrTx: string,
  ): Promise<SorobanRpc.Api.SendTransactionResponse> {
    return await this.sdk.utils.srb.sendTransactionSoroban(xdrTx);
  }

  async confirmSorobanTx(
    hash: string,
    secondsToWait?: number,
  ): Promise<SorobanRpc.Api.GetTransactionResponse> {
    return await this.sdk.utils.srb.confirmTx(hash, secondsToWait);
  }


  async getTransferStatus(
    chainSymbol: ChainSymbol,
    txId: string,
  ): Promise<TransferStatusResponse> {
    return this.sdk.getTransferStatus(chainSymbol, txId);
  }

  async getTokenByAddress(
    tokenAddress: string,
    type: 'swap' | 'pool' = 'swap',
  ): Promise<TokenWithChainDetails | undefined> {
    if (!tokenAddress) {
      return undefined;
    }

    const normalizedAddress = tokenAddress.toUpperCase();
    const tokens = await this.getTokens(type);
    return tokens.find(
      (token) =>
        token.tokenAddress?.toUpperCase() === normalizedAddress
        || token.poolAddress?.toUpperCase() === normalizedAddress,
    );
  }

  async getAllTokensAddresses(): Promise<string[]> {
    const tokens = await this.getTokens();
    return tokens.map((token) => token.tokenAddress);
  }

  async getTokenByAddressAndType(
    tokenAddress: string,
    type: 'bridge' | 'pool' | 'yield' = 'bridge',
  ): Promise<TokenWithChainDetails | TokenWithChainDetailsYield | CYDToken | undefined> {
    if (type === 'yield') {
      return await this.getCYDTokenByYieldAddress(tokenAddress);
    }
    if (type === 'pool') {
      return await this.getTokenByAddress(tokenAddress, 'pool');
    }
    return await this.getTokenByAddress(tokenAddress, 'swap');
  }

  async getCYDTokens(): Promise<CYDToken[]> {
    return this.sdk.yield.getCYDTokens();
  }

  async getYieldAllowance(params: YieldGetAllowanceParams): Promise<string> {
    return this.sdk.yield.getAllowance(params);
  }

  async checkYieldAllowance(params: YieldCheckAllowanceParams): Promise<boolean> {
    return this.sdk.yield.checkAllowance(params);
  }

  async getCYDTokenByYieldAddress(yieldAddress: string): Promise<CYDToken | undefined> {
    if (!yieldAddress) {
      return undefined;
    }

    const normalizedAddress = yieldAddress.toUpperCase();
    const cydTokens = await this.getCYDTokens();
    return cydTokens.find(
      (token) =>
        token.yieldAddress?.toUpperCase() === normalizedAddress
    );
  }

  async getTokenWithYieldByAddress(tokenAddress: string): Promise<TokenWithChainDetailsYield | undefined> {
    if (!tokenAddress) {
      return undefined;
    }

    const normalizedAddress = tokenAddress.toUpperCase();
    const cydTokens = await this.getCYDTokens();
    return cydTokens.flatMap((t) => t.tokens).find(
      (token) =>
        token.tokenAddress?.toUpperCase() === normalizedAddress
        || token.poolAddress?.toUpperCase() === normalizedAddress,
    );
  }

  async getCYDTokenBalance(params: YieldBalanceParams): Promise<string> {
    return await this.sdk.yield.balanceOf(params);
  }

  async getYieldEstimatedAmountOnDeposit(params: YieldGetEstimatedAmountOnDepositParams): Promise<string> {
    return await this.sdk.yield.getEstimatedAmountOnDeposit(params);
  }

  async getYieldWithdrawAmounts(params: YieldGetWithdrawProportionAmountParams): Promise<YieldWithdrawAmount[]> {
    return await this.sdk.yield.getWithdrawAmounts(params);
  }

  async yieldApprove(params: YieldApproveParams): Promise<RawTransaction> {
    return await this.sdk.yield.rawTxBuilder.approve(params);
  }

  async yieldDeposit(params: YieldDepositParams): Promise<RawTransaction> {
    return await this.sdk.yield.rawTxBuilder.deposit(params);
  }

  async yieldWithdraw(params: YieldWithdrawParams): Promise<RawTransaction> {
    return await this.sdk.yield.rawTxBuilder.withdraw(params);
  }

  async sponsorWrapRawTx(
    sponsor: string,
    tx: string,
    fundLamports?: number
  ): Promise<RawTransaction> {
    const urls = ConfigService.getRPCUrls();
    const connection = new solanaWeb3Connection(urls["SOL"], "finalized");
    const rawTxHex = tx.startsWith("0x") ? tx.slice(2) : tx;

    return sponsorWrapRawTx({
      connection,
      sponsorPubkey: new PublicKey(sponsor),
      fundLamports: fundLamports ?? 0,
      rawTxHex,
    });
  }

  async solanaAddMemo(tx: string, memo: string): Promise<RawTransaction> {
    const rawTxHex = tx.startsWith("0x") ? tx.slice(2) : tx;
    const versionedTx = VersionedTransaction.deserialize(
      Buffer.from(rawTxHex, "hex"),
    );
    await this.sdk.utils.sol.addMemoToTx(versionedTx, memo);
    return Buffer.from(versionedTx.serialize()).toString("hex");
  }

  async suiRaw2Base64(rawTx: string): Promise<RawTransaction> {
    return await raw2base64(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.SUI.toString()));
  }

  async suiBuildSendTxFromCustomTx(
    baseTx: string,
    inputCoin: string,
    params: string,
  ): Promise<RawTransaction> {
    try {
      return await this.sdk.utils.sui.buildSendTxFromCustomTx(
        baseTx,
        JSON.parse(inputCoin) as TransactionResult,
        JSON.parse(params) as SendParams,
      );
    } catch (e) {
      throw new HttpException(
        `Invalid Sui custom transaction payload: ${(e as Error).message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async tronRaw2Hex(rawTx: string): Promise<RawTransaction> {
    return await raw2hex(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.TRX.toString()));
  }
}
