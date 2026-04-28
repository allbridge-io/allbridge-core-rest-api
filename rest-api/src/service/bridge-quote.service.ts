import {
  AmountFormat,
  FeePaymentMethod,
  Messenger,
  PendingStatusInfoResponse,
  TokenWithChainDetails,
} from '@allbridge/bridge-core-sdk';
import { Injectable } from '@nestjs/common';
import { Big } from 'big.js';
import { convertGt0IntAmountToFloat } from '../utils/calculation';
import { SDKService, SwapCalcInfo } from './sdk.service';

export interface BridgeQuoteResponse {
  amountInt: string;
  amountFloat: string;
  sourceTokenAddress: string;
  destinationTokenAddress: string;
  options: BridgeQuoteOption[];
}
export interface BridgeQuoteOption {
  messenger: keyof typeof Messenger;
  messengerIndex?: Messenger;
  estimatedTimeMs: number | null;
  paymentMethods: BridgeQuotePayment[];
}
export interface BridgeQuotePayment {
  feePaymentMethod: keyof typeof FeePaymentMethod;
  fee: string;
  pendingTxs?: number;
  pendingAmount?: string;
  estimatedAmount: {
    min: string;
    max: string;
  };
  relayerFeeInStable?: string;
  relayerFeeInNative?: string;
  relayerFeeInAbr?: string;
  abrPayerAddress?: string;
  abrTokenAddress?: string;
  poolImpact?: SwapCalcInfo;
  lpFeeTotal?: string;
  transferFee?: string;
}

@Injectable()
export class BridgeQuoteService {
  constructor(private readonly sdk: SDKService) {}

  async getQuote(params: {
    amountInt: string;
    sourceToken: TokenWithChainDetails;
    destinationToken: TokenWithChainDetails;
  }): Promise<BridgeQuoteResponse> {
    const { amountInt, sourceToken, destinationToken } = params;

    const amountFloat = convertGt0IntAmountToFloat(amountInt, sourceToken.decimals);
    const messengers = this.detectMessengers(sourceToken, destinationToken);

    const options: BridgeQuoteOption[] = [];

    for (const messengerIndex of messengers) {
      const opt = await this.buildOption({
        messengerIndex,
        amountInt,
        amountFloat,
        sourceToken,
        destinationToken,
      });
      options.push(opt);
    }

    return {
      amountInt,
      amountFloat,
      sourceTokenAddress: sourceToken.tokenAddress,
      destinationTokenAddress: destinationToken.tokenAddress,
      options,
    };
  }

  private async buildOption(params: {
    messengerIndex: Messenger;
    amountInt: string;
    amountFloat: string;
    sourceToken: TokenWithChainDetails;
    destinationToken: TokenWithChainDetails;
  }): Promise<BridgeQuoteOption> {
    const { messengerIndex, amountInt, amountFloat, sourceToken, destinationToken } = params;

    const estimatedTimeMs =
      this.sdk.getTransferTime(sourceToken, destinationToken, messengerIndex) ?? null;

    const gasFeeOptions = await this.sdk.getGasFeeOptions(
      sourceToken,
      destinationToken,
      messengerIndex,
    );

    const payments: BridgeQuotePayment[] = [];

    for (const methodKey of Object.keys(FeePaymentMethod)) {
      const method = FeePaymentMethod[methodKey as keyof typeof FeePaymentMethod];
      const feeData = gasFeeOptions[method];
      if (!feeData) continue;

      const feeInt = feeData[AmountFormat.INT];
      const amountForRouteInt = method === FeePaymentMethod.WITH_STABLECOIN
        ? Big(amountInt).minus(feeInt)
        : Big(amountInt);
      if (amountForRouteInt.lte(0)) {
        continue;
      }

      const pending = await this.getPendingSafe(amountInt, sourceToken, destinationToken);

      const receive = await this.calcReceive({
        messengerIndex,
        sourceToken,
        destinationToken,
        amountFloat,
        feeInt: method === FeePaymentMethod.WITH_STABLECOIN ? feeInt : undefined,
      });
      if (!receive) {
        continue;
      }

      let lpFeeRaw: SwapCalcInfo = {
        sourceLiquidityFee: '0',
        sourceSwap: '0',
        destinationLiquidityFee: '0',
        destinationSwap: '0',
      };
      let lpFeeTotal = '0';

      if ([Messenger.ALLBRIDGE, Messenger.WORMHOLE].includes(messengerIndex)) {
        lpFeeRaw = await this.sdk.swapAndBridgeDetails(
          amountForRouteInt.gt(0) ? amountForRouteInt.toString() : '0',
          AmountFormat.INT,
          sourceToken,
          destinationToken,
        );
        lpFeeTotal = this.sumLpFee(lpFeeRaw);
      }

      const transferFee = await this.getTransferFee(
        amountInt,
        messengerIndex,
        sourceToken,
        destinationToken,
        method,
        feeInt,
      );

      const payment: BridgeQuotePayment = {
        feePaymentMethod: methodKey as keyof typeof FeePaymentMethod,
        fee: feeInt,
        pendingTxs: pending?.pendingTxs,
        pendingAmount: pending?.pendingAmount[AmountFormat.INT],
        estimatedAmount: {
          min: receive.min,
          max: receive.max,
        },
      };

      if (method === FeePaymentMethod.WITH_STABLECOIN) {
        payment.relayerFeeInStable = feeData[AmountFormat.INT];
      }

      if (method === FeePaymentMethod.WITH_NATIVE_CURRENCY) {
        payment.relayerFeeInNative = feeData[AmountFormat.INT];
      }

      if (method === FeePaymentMethod.WITH_ABR) {
        payment.relayerFeeInAbr = feeData[AmountFormat.INT];
        payment.abrPayerAddress = sourceToken.abrPayer?.payerAddress;
        payment.abrTokenAddress = sourceToken.abrPayer?.abrToken.tokenAddress;
      }

      if ([Messenger.ALLBRIDGE, Messenger.WORMHOLE].includes(messengerIndex)) {
        payment.poolImpact = {
          sourceLiquidityFee: Big(lpFeeRaw.sourceLiquidityFee)
            .mul(Big('10').pow(sourceToken.decimals))
            .round(0, Big.roundDown)
            .toString(),
          sourceSwap: Big(lpFeeRaw.sourceSwap)
            .mul(Big('10').pow(sourceToken.decimals))
            .round(0, Big.roundDown)
            .toString(),
          destinationLiquidityFee: Big(lpFeeRaw.destinationLiquidityFee)
            .mul(Big('10').pow(destinationToken.decimals))
            .round(0, Big.roundDown)
            .toString(),
          destinationSwap: Big(lpFeeRaw.destinationSwap)
            .mul(Big('10').pow(destinationToken.decimals))
            .round(0, Big.roundDown)
            .toString(),
        };
        payment.lpFeeTotal = Big(lpFeeTotal)
          .mul(Big('10').pow(destinationToken.decimals))
          .mul('-1')
          .round(0, Big.roundDown)
          .toString();
      }

      if (
        [
          Messenger.CCTP,
          Messenger.CCTP_V2,
          Messenger.OFT,
          Messenger.X_RESERVE,
        ].includes(messengerIndex)
      ) {
        payment.transferFee = transferFee;
      }

      payments.push(payment);
    }

    return {
      messengerIndex,
      messenger: Messenger[messengerIndex] as keyof typeof Messenger,
      estimatedTimeMs,
      paymentMethods: payments,
    };
  }

  private detectMessengers(
    source: TokenWithChainDetails,
    dest: TokenWithChainDetails,
  ): Messenger[] {
    const list: Messenger[] = [];

    list.push(Messenger.ALLBRIDGE);

    if (
      source.suiAddresses?.wormholeMessengerAddress &&
      dest.suiAddresses?.wormholeMessengerAddress
    ) {
      list.push(Messenger.WORMHOLE);
    }

    if (source.cctpAddress && dest.cctpAddress) {
      list.push(Messenger.CCTP);
    }

    if (source.cctpV2Address && dest.cctpV2Address) {
      list.push(Messenger.CCTP_V2);
    }

    if (source.oftId && dest.oftId && source.oftId === dest.oftId) {
      list.push(Messenger.OFT);
    }

    if (source.xReserve && dest.xReserve) {
      list.push(Messenger.X_RESERVE);
    }

    return list;
  }

  private async getPendingSafe(
    amountInt: string,
    source: TokenWithChainDetails,
    dest: TokenWithChainDetails,
  ): Promise<PendingStatusInfoResponse | undefined> {
    try {
      return await this.sdk.getPendingStatusInfo(amountInt, AmountFormat.INT, source, dest);
    } catch {
      return undefined;
    }
  }

  private async calcReceive(params: {
    messengerIndex: Messenger;
    sourceToken: TokenWithChainDetails;
    destinationToken: TokenWithChainDetails;
    amountFloat: string;
    feeInt?: string;
  }): Promise<{ min: string; max: string } | null> {
    const { messengerIndex, sourceToken, destinationToken, amountFloat, feeInt } = params;

    const stableFeeFloat = feeInt
      ? Big(feeInt).div(Big(10).pow(sourceToken.decimals)).toFixed()
      : undefined;

    const result = await this.sdk.getAmountToBeReceived(
      amountFloat,
      sourceToken,
      destinationToken,
      messengerIndex,
      false,
      stableFeeFloat,
    );
    if (!result.amountReceivedInFloat) {
      return null;
    }

    const intAmount = this.toInt(result.amountReceivedInFloat, destinationToken.decimals);

    return {
      min: intAmount,
      max: intAmount,
    };
  }

  private async getTransferFee(
    amountInt: string,
    messenger: Messenger,
    source: TokenWithChainDetails,
    dest: TokenWithChainDetails,
    feePaymentMethod: FeePaymentMethod,
    feeInt: string,
  ): Promise<string> {
    const amountForRoute = feePaymentMethod === FeePaymentMethod.WITH_STABLECOIN
      ? Big(amountInt).minus(feeInt)
      : Big(amountInt);

    if (amountForRoute.lte(0)) {
      return '0';
    }

    if (
      messenger === Messenger.CCTP &&
      source.cctpAddress &&
      dest.cctpAddress &&
      source.cctpFeeShare
    ) {
      const amountAfterRouteFee = amountForRoute
        .mul(Big(1).minus(source.cctpFeeShare))
        .round(0, Big.roundUp);
      return amountForRoute
        .minus(amountAfterRouteFee)
        .toString();
    }

    if (
      messenger === Messenger.CCTP_V2 &&
      source.cctpV2Address &&
      dest.cctpV2Address &&
      source.cctpV2FeeShare
    ) {
      const amountAfterRouteFee = amountForRoute
        .mul(Big(1).minus(source.cctpV2FeeShare))
        .round(0, Big.roundUp);
      return amountForRoute
        .minus(amountAfterRouteFee)
        .toString();
    }

    if (
      messenger === Messenger.OFT &&
      source.oftId &&
      dest.oftId &&
      source.oftId === dest.oftId &&
      source.oftBridgeAddress &&
      dest.oftBridgeAddress
    ) {
      const gasFeeOptions = await this.sdk.getGasFeeOptions(source, dest, messenger);
      const shareFloat = gasFeeOptions.adminFeeShareWithExtras;
      if (!shareFloat) {
        return '0';
      }
      const amountAfterRouteFee = amountForRoute
        .mul(Big(1).minus(shareFloat))
        .round(0, Big.roundUp);
      return amountForRoute
        .minus(amountAfterRouteFee)
        .toString();
    }

    if (
      messenger === Messenger.X_RESERVE &&
      source.xReserve &&
      dest.xReserve
    ) {
      const amountAfterRouteFee = amountForRoute
        .mul(Big(1).minus(source.xReserve.feeShare))
        .minus(source.xReserve.feeConst)
        .round(0, Big.roundDown);
      return amountForRoute
        .minus(amountAfterRouteFee)
        .toString();
    }

    return '0';
  }

  private toInt(valFloat: string, decimals: number): string {
    return Big(valFloat)
      .mul(Big(10).pow(decimals))
      .round(0, Big.roundDown)
      .toString();
  }

  private sumLpFee(lp: SwapCalcInfo): string {
    return Big(lp.sourceLiquidityFee || 0)
      .plus(lp.destinationLiquidityFee || 0)
      .toString();
  }
}
