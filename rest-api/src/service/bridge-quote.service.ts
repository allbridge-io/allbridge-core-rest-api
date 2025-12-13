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
  estimatedTimeMs: number;
  sourceTxCostInNative: string;
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
  relayerFeeInStable: string;
  relayerFeeInNative: string;
  lpFee: SwapCalcInfo;
  lpFeeTotal: string;
  transferFee: string;
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

    const sourceTxCostInNative = '0';

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
      const pending = await this.getPendingSafe(amountInt, sourceToken, destinationToken);

      const receive = await this.calcReceive({
        messengerIndex,
        sourceToken,
        destinationToken,
        amountFloat,
        feeInt: method === FeePaymentMethod.WITH_STABLECOIN ? feeInt : undefined,
      });

      let lpFeeRaw: SwapCalcInfo = {
        sourceLiquidityFee: '0',
        sourceSwap: '0',
        destinationLiquidityFee: '0',
        destinationSwap: '0',
      };
      let lpFeeTotal = '0';

      if ([Messenger.ALLBRIDGE, Messenger.WORMHOLE].includes(messengerIndex)) {
        lpFeeRaw = await this.sdk.swapAndBridgeDetails(
          amountInt,
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
      );

      payments.push({
        feePaymentMethod: methodKey as keyof typeof FeePaymentMethod,
        fee: feeInt,
        pendingTxs: pending?.pendingTxs,
        pendingAmount: pending?.pendingAmount[AmountFormat.INT],
        estimatedAmount: {
          min: receive.min,
          max: receive.max,
        },
        relayerFeeInStable:
          method === FeePaymentMethod.WITH_STABLECOIN ? feeData[AmountFormat.INT] : '0',
        relayerFeeInNative:
          method === FeePaymentMethod.WITH_NATIVE_CURRENCY ? feeData[AmountFormat.INT] : '0',
        lpFee: {
          sourceLiquidityFee: Big(lpFeeRaw.sourceLiquidityFee).mul(Big('10').pow(sourceToken.decimals)).round(0, Big.roundDown).toString(),
          sourceSwap: Big(lpFeeRaw.sourceSwap).mul(Big('10').pow(sourceToken.decimals)).round(0, Big.roundDown).toString(),
          destinationLiquidityFee: Big(lpFeeRaw.destinationLiquidityFee).mul(Big('10').pow(destinationToken.decimals)).round(0, Big.roundDown).toString(),
          destinationSwap: Big(lpFeeRaw.destinationSwap).mul(Big('10').pow(destinationToken.decimals)).round(0, Big.roundDown).toString(),
        },
        lpFeeTotal: Big(lpFeeTotal).mul(Big('10').pow(destinationToken.decimals)).mul('-1').round(0, Big.roundDown).toString(),
        transferFee,
      });
    }

    return {
      messengerIndex,
      messenger: Messenger[messengerIndex] as keyof typeof Messenger,
      estimatedTimeMs,
      sourceTxCostInNative,
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
  }): Promise<{ min: string; max: string }> {
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
  ): Promise<string> {
    if (
      messenger === Messenger.CCTP &&
      source.cctpAddress &&
      dest.cctpAddress &&
      source.cctpFeeShare
    ) {
      return Big(amountInt)
        .mul(Big(source.cctpFeeShare))
        .round(0, Big.roundUp)
        .toString();
    }

    if (
      messenger === Messenger.CCTP_V2 &&
      source.cctpV2Address &&
      dest.cctpV2Address &&
      source.cctpV2FeeShare
    ) {
      return Big(amountInt)
        .mul(Big(source.cctpV2FeeShare))
        .round(0, Big.roundUp)
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
      const shareFloat = Big(gasFeeOptions.adminFeeShareWithExtras)
        .div(Big(10)
        .pow(source.decimals));
      return Big(amountInt)
        .mul(shareFloat)
        .round(0, Big.roundUp)
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
