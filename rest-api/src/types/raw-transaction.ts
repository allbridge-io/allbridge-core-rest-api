import { RawTransaction as SdkRawTransaction } from '@allbridge/bridge-core-sdk';

export interface RawTronTransactionContractParameter<T = unknown> {
  value: T;
  type_url: string;
}

export interface RawTronTransactionContract<T = unknown> {
  type: string;
  parameter: RawTronTransactionContractParameter<T>;
  Permission_id?: number;
}

export interface RawTronTransactionResponse<T = unknown> {
  visible: boolean;
  txID: string;
  raw_data: {
    contract: RawTronTransactionContract<T>[];
    ref_block_bytes: string;
    ref_block_hash: string;
    expiration: number;
    timestamp: number;
    data?: unknown;
    fee_limit?: unknown;
  };
  raw_data_hex: string;
}

export type RawTransaction = SdkRawTransaction;
