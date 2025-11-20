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
  RawBridgeSolanaTransaction,
  RawPoolSolanaTransaction,
  RawTransaction,
  SendParams,
  SwapParams,
  TokenWithChainDetails,
  TokenWithChainDetailsYield,
  TransferStatusResponse,
  UserBalanceInfo,
  YieldCheckAllowanceParams,
  YieldGetAllowanceParams,
  YieldGetEstimatedAmountOnDepositParams,
  YieldGetWithdrawProportionAmountParams,
  YieldWithdrawAmount,
} from '@allbridge/bridge-core-sdk';
import { YieldBalanceParams } from '@allbridge/bridge-core-sdk/dist/src/services/yield/models';
import {
  YieldApproveParams, YieldDepositParams, YieldWithdrawParams,
} from '@allbridge/bridge-core-sdk/dist/src/services/yield/models/yield.model';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import solanaWeb3, { PublicKey } from '@solana/web3.js';
import { raw2base64 } from '../utils/sui';
import { raw2hex } from '../utils/tron';
import { HorizonApi } from '@stellar/stellar-sdk/lib/horizon';

import { Big } from 'big.js';
import * as console from 'node:console';
import { sponsorWrapRawTx } from '../utils/solana';
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

/**
 * Response containing the fee and amount adjustments in Token for the bridge transaction.
 */
export interface SwapCalcInfo {
  /**
   * Paid for the swap liquidity on the source Chain
   */
  sourceLiquidityFee: string;

  /**
   * Amount adjustment on the swap from the source Token
   */
  sourceSwap: string;

  /**
   * Paid for the swap liquidity on the destination Chain
   */
  destinationLiquidityFee: string;

  /**
   * Amount adjustment on the swap to the destination Token
   */
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
  private _chainDetailsMap?: ChainDetailsMap;

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
    });
  }

  // Common
  async getTokens(type?: 'swap' | 'pool'): Promise<TokenWithChainDetails[]> {
    return await this.sdk.tokens(type);
  }

  async chainDetailsMap(type?: 'swap' | 'pool'): Promise<ChainDetailsMap> {
    if (!this._chainDetailsMap) {
      this._chainDetailsMap = await this.sdk.chainDetailsMap(type);
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
        token.tokenAddress.toUpperCase() === tokenAddress.toUpperCase()
        || token.poolAddress.toUpperCase() === tokenAddress.toUpperCase(),
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
      return raw2base64(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.SUI.toString()));
    }
    if (params.sourceToken.chainSymbol === ChainSymbol.TRX && outputFormat === 'hex') {
      return await raw2hex(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.TRX.toString()));
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
    return this.sdk.bridge.checkAllowance(params);
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
    return this.sdk.bridge.rawTxBuilder.approve(params);
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
      const errorCode = e.errorCode;
      console.error('errorCode', errorCode);
      console.error(`Error in getAmountToBeReceived: ${e.message}`, e);
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
      const errorCode = e.errorCode;
      console.error('errorCode', errorCode);
      console.error(`Error in getAmountToSend: ${e.message}`, e);
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

  // History

  async getTransferStatus(
    chainSymbol: ChainSymbol,
    txId: string,
  ): Promise<TransferStatusResponse> {
    return this.sdk.getTransferStatus(chainSymbol, txId);
  }

  async getTokenByAddress(tokenAddress: string): Promise<TokenWithChainDetails | undefined> {
    const tokens = await this.getTokens();
    return tokens.find(
      (token) =>
        token.tokenAddress.toUpperCase() === tokenAddress.toUpperCase()
        || token.poolAddress.toUpperCase() === tokenAddress.toUpperCase(),
    );
  }

  async getAllTokensAddresses(): Promise<string[]> {
    const tokens = await this.getTokens();
    return tokens.map((token) => token.tokenAddress);
  }

  async getTokenByAddressAndType(
    tokenAddress: string,
    type: 'bridge' | 'pool' | 'yield' = 'bridge',
  ): Promise<TokenWithChainDetails | TokenWithChainDetailsYield | undefined> {
    if (type === 'yield') {
      return await this.getCYDTokenByYieldAddress(tokenAddress);
    }
    return await this.getTokenByAddress(tokenAddress);
  }

  // Yield
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
    const cydTokens = await this.getCYDTokens();
    return cydTokens.find(
      (token) =>
        token.yieldAddress.toUpperCase() === yieldAddress.toUpperCase()
    );
  }

  async getTokenWithYieldByAddress(tokenAddress: string): Promise<TokenWithChainDetailsYield | undefined> {
    const cydTokens = await this.getCYDTokens();
    return cydTokens.flatMap(t => t.tokens).find(
      (token) =>
        token.tokenAddress.toUpperCase() === tokenAddress.toUpperCase()
        || token.poolAddress.toUpperCase() === tokenAddress.toUpperCase(),
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

  // Utils
  async sponsorWrapRawTx(
    sponsor: string,
    tx: string,
    fundLamports?: number
  ): Promise<RawTransaction> {
    const urls = ConfigService.getRPCUrls();
    const connection = new solanaWeb3.Connection(urls["SOL"], "finalized");
    const rawTxHex = tx.startsWith("0x") ? tx.slice(2) : tx;

    return sponsorWrapRawTx({
      connection,
      sponsorPubkey: new PublicKey(sponsor),
      fundLamports: fundLamports ?? 0,
      rawTxHex,
    });
  }

  async suiRaw2Base64(rawTx: string): Promise<RawTransaction> {
    return raw2base64(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.SUI.toString()));
  }

  async tronRaw2Hex(rawTx: string): Promise<RawTransaction> {
    return raw2hex(rawTx, ConfigService.getNetworkNodeUrl(ChainSymbol.TRX.toString()));
  }
}
