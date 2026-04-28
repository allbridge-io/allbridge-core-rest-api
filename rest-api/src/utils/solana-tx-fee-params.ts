import { SolanaAutoTxFee, TxFeeParams } from '@allbridge/bridge-core-sdk';
import { SolanaTxFeeParamsMethod } from '../service/sdk.service';

export function buildBridgeSolanaTxFeeParams(
  solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
  solanaTxFeeValue?: string,
  solanaPayTxFeeWithStablecoinSwap?: boolean,
): TxFeeParams | undefined {
  if (!solanaTxFeeParams) {
    return undefined;
  }

  const solanaTxFeeParamsEnum = SolanaTxFeeParamsMethod[solanaTxFeeParams];
  if (solanaTxFeeParamsEnum === SolanaTxFeeParamsMethod.AUTO) {
    return {
      solana: {
        fee: SolanaAutoTxFee,
        payTxFeeWithStablecoinSwap: solanaPayTxFeeWithStablecoinSwap ?? false,
      },
    };
  }

  const fee = solanaTxFeeParamsEnum === SolanaTxFeeParamsMethod.PRICE_PER_UNIT_IN_MICRO_LAMPORTS
    ? {
      pricePerUnitInMicroLamports: solanaTxFeeValue ?? '0',
    }
    : {
      extraFeeInLamports: solanaTxFeeValue ?? '0',
    };

  return {
    solana: {
      fee,
      payTxFeeWithStablecoinSwap: solanaPayTxFeeWithStablecoinSwap ?? false,
    },
  };
}

export function buildPoolSolanaTxFeeParams(
  solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
  solanaTxFeeValue?: string,
): TxFeeParams | undefined {
  if (!solanaTxFeeParams) {
    return undefined;
  }

  const solanaTxFeeParamsEnum = SolanaTxFeeParamsMethod[solanaTxFeeParams];
  if (solanaTxFeeParamsEnum === SolanaTxFeeParamsMethod.AUTO) {
    return {
      solana: SolanaAutoTxFee,
    };
  }

  const solana = solanaTxFeeParamsEnum === SolanaTxFeeParamsMethod.PRICE_PER_UNIT_IN_MICRO_LAMPORTS
    ? {
      pricePerUnitInMicroLamports: solanaTxFeeValue ?? '0',
    }
    : {
      extraFeeInLamports: solanaTxFeeValue ?? '0',
    };

  return {
    solana,
  };
}
