import {
  AllbridgeCoreSdk,
  AmountFormat,
  AmountFormatted,
  ChainDetailsMap,
  ChainSymbol,
  CheckAddressResponse,
  CheckAllowanceParams,
  ExtraGasMaxLimitResponse,
  GasBalanceResponse,
  GasFeeOptions,
  GetAllowanceParams,
  GetNativeTokenBalanceParams,
  GetTokenBalanceParams,
  LiquidityPoolsApproveParams,
  LiquidityPoolsParams,
  LiquidityPoolsParamsWithAmount,
  Messenger,
  PendingStatusInfoResponse,
  PoolInfo,
  RawBridgeSolanaTransaction,
  RawPoolSolanaTransaction,
  RawTransaction,
  SendParams,
  SwapParams,
  TokenWithChainDetails,
  TransferStatusResponse,
  UserBalanceInfo,
  mainnet,
} from '@allbridge/bridge-core-sdk';

import { Injectable } from '@nestjs/common';
import Big from 'big.js';
import { getLogger } from '../utils/logger-factory';
import { ConfigService } from './config.service';
import { HorizonApi } from '@stellar/stellar-sdk/lib/horizon';

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
  logger = getLogger(`SDKService`);
  private _chainDetailsMap?: ChainDetailsMap;

  constructor() {
    this.sdk = new AllbridgeCoreSdk(ConfigService.getRPCUrls(), {
      ...mainnet,
      coreApiHeaders: ConfigService.getCoreApiHeaders(),
      jupiterUrl: ConfigService.getJupiterUrl(),
      tronJsonRpc: ConfigService.getTronJsonRpc(),
    });
  }

  // Common
  async getTokens(): Promise<TokenWithChainDetails[]> {
    return await this.sdk.tokens();
  }

  async chainDetailsMap(): Promise<ChainDetailsMap> {
    if (!this._chainDetailsMap) {
      this._chainDetailsMap = await this.sdk.chainDetailsMap();
    }
    return this._chainDetailsMap;
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
    const tokens = await this.sdk.tokensByChain(chainSymbol);
    return tokens.find(
      (token) =>
        token.tokenAddress.toUpperCase() === tokenAddress.toUpperCase(),
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
  ): Promise<ExtraGasMaxLimitResponse> {
    return this.sdk.getExtraGasMaxLimits(
      sourceChainToken,
      destinationChainToken,
    );
  }

  async getGasBalance(
    chain: ChainSymbol,
    address: string,
  ): Promise<GasBalanceResponse> {
    return this.sdk.getGasBalance(chain, address);
  }

  async checkAddress(
    chain: ChainSymbol,
    address: string,
    tokenAddress: string,
  ): Promise<CheckAddressResponse> {
    return this.sdk.checkAddress(chain, address, tokenAddress);
  }

  async checkBalanceLine(
    address: string,
    tokenAddress: string,
  ): Promise<HorizonApi.BalanceLineAsset> {
    return await this.sdk.utils.srb.getBalanceLine(address, tokenAddress);
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

  // Bridge
  async send(params: SwapParams | SendParams): Promise<RawTransaction> {
    console.debug(params);
    const rawTx = await this.sdk.bridge.rawTxBuilder.send(params);
    if (params.sourceToken.chainSymbol === ChainSymbol.SOL) {
      return Buffer.from(
        (
          rawTx as RawBridgeSolanaTransaction | RawPoolSolanaTransaction
        ).serialize(),
      ).toString('hex');
    }
    return rawTx;
  }

  // Pools
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
    return this.sdk.pool.getAllowance(params);
  }

  async checkAllowance(params: CheckAllowanceParams): Promise<boolean> {
    return this.sdk.pool.checkAllowance(params);
  }

  async getUserPoolInfo(
    account: string,
    token: TokenWithChainDetails,
  ): Promise<UserBalanceInfo> {
    return this.sdk.pool.getUserBalanceInfo(account, token);
  }

  async approve(params: LiquidityPoolsApproveParams): Promise<RawTransaction> {
    return this.sdk.pool.rawTxBuilder.approve(params);
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

  async getAmountToBeReceived(
    amount: string,
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
        ? Big(amount)
            .minus(stableFeeInFloat)
            .round(sourceToken.decimals)
            .toFixed()
        : amount;
      if (Big(amountToSendFloat).lte(0)) {
        return { amountInFloat: amount, amountReceivedInFloat: '' };
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
      return { amountInFloat: amount, amountReceivedInFloat: amountReceived };
    } catch (e: any) {
      const errorCode = e.errorCode;
      console.error('errorCode', errorCode);
      return { amountInFloat: amount, amountReceivedInFloat: '' };
    }
  }

  async getAmountToSend(
    amountReceived: string,
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
      const roundedAmountReceived = Big(amountReceived)
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
      const errorCode = e.errorCode;
      console.error('errorCode', errorCode);
      return { amountInFloat: '', amountReceivedInFloat: amountReceived };
    }
    const amountInFloat = stableFeeInFloat
      ? Big(amount).plus(stableFeeInFloat)
      : Big(amount);
    return {
      amountInFloat: amountInFloat
        .round(sourceToken.decimals, Big.roundUp)
        .toFixed(),
      amountReceivedInFloat: amountReceived,
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

  // History

  async getTransferStatus(
    chainSymbol: ChainSymbol,
    txId: string,
  ): Promise<TransferStatusResponse> {
    return this.sdk.getTransferStatus(chainSymbol as ChainSymbol, txId);
  }

  async getTokenByAddress(tokenAddress: string) {
    const tokens = await this.getTokens();
    return tokens.find(
      (token) =>
        token.tokenAddress.toUpperCase() === tokenAddress.toUpperCase(),
    );
  }

  async getAllTokensAddresses(): Promise<string[]> {
    const tokens = await this.getTokens();
    return tokens.map((token) => token.tokenAddress);
  }
}
