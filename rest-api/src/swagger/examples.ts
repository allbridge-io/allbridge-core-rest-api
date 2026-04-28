import { EssentialWeb3Transaction, Messenger } from '@allbridge/bridge-core-sdk';
import { BridgeQuoteResponse } from '../service/bridge-quote.service';
import { RawTronTransactionResponse } from '../types/raw-transaction';

export const RAW_BRIDGE_EVM_EXAMPLE: EssentialWeb3Transaction = {
  from: '0x0000000000000000000000000000000000000000',
  to: '0x0000000000000000000000000000000000000000',
  value: '1000',
  data: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

export const RAW_BRIDGE_SOLANA_EXAMPLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const RAW_BRIDGE_STELLAR_EXAMPLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export const RAW_BRIDGE_STX_EXAMPLE =
  '80800000000400b168de3a000000000000000100000000000000000000000000000000';

export const RAW_BRIDGE_TRON_EXAMPLE: RawTronTransactionResponse = {
  visible: false,
  txID: '0000000000000000000000000000000000000000000000000000000000000000',
  raw_data: {
    contract: [],
    ref_block_bytes: '0000',
    ref_block_hash: '0000000000000000',
    expiration: 0,
    timestamp: 0,
  },
  raw_data_hex: '00',
};

export const STELLAR_TRUSTLINE_XDR_EXAMPLE =
  'AAAAAgAAAADXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

export const STELLAR_RESTORE_XDR_EXAMPLE =
  'AAAAAwAAAADXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

export const SOLANA_RAW_TX_HEX_EXAMPLE =
  '0a0b0c0d';

export const SUI_RAW_TX_JSON_EXAMPLE =
  '{"version":2,"sender":"0x0","expiration":{"None":true},"gasData":{"budget":"1","price":"1","owner":"0x0","payment":[]}}';

export const SUI_CUSTOM_TX_RESULT_EXAMPLE = {
  '$kind': 'Result',
  Result: 0,
};

export const AMOUNT_FORMATTED_EXAMPLE = {
  int: '1000000',
  float: '1',
};

export const APR_PERCENT_EXAMPLE = '12.34%';

export const TOKEN_EXAMPLE = {
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  poolAddress: '0x0000000000000000000000000000000000000002',
  tokenAddress: '0x0000000000000000000000000000000000000001',
  feeShare: '0.001',
  apr: '0.12',
  apr7d: '0.1234',
  apr30d: '0.1199',
  lpRate: '1.01',
  chainSymbol: 'ETH',
  chainType: 'EVM',
  chainId: '1',
  chainName: 'Ethereum',
  allbridgeChainId: 1,
  bridgeAddress: '0x0000000000000000000000000000000000000003',
  confirmations: 12,
  txCostAmount: {
    transfer: '5000',
    swap: '1000',
  },
  transferTime: {
    ALLBRIDGE: 90000,
  },
};

export const BRIDGE_AMOUNTS_EXAMPLE = {
  amountInFloat: '1',
  amountReceivedInFloat: '0.9985',
};

export const SWAP_CALC_INFO_EXAMPLE = {
  sourceLiquidityFee: '0.001',
  sourceSwap: '0.0005',
  destinationLiquidityFee: '0.0003',
  destinationSwap: '0.0002',
};

export const GAS_FEE_OPTIONS_EXAMPLE = {
  native: {
    int: '5000',
    float: '0.000005',
  },
  stablecoin: {
    int: '1200',
    float: '0.0012',
  },
  abr: {
    int: '980',
    float: '0.00098',
  },
  adminFeeShareWithExtras: '0.1',
};

export const GAS_BALANCE_EXAMPLE = {
  gasBalance: '0.125',
  status: 'OK',
};

export const EXTRA_GAS_MAX_LIMITS_EXAMPLE = {
  extraGasMax: {
    native: {
      int: '1000000',
      float: '0.001',
    },
    stablecoin: {
      int: '500000',
      float: '0.5',
    },
    abr: {
      int: '490000',
      float: '0.49',
    },
  },
  destinationChain: {
    gasAmountMax: {
      int: '250000',
      float: '0.00025',
    },
    swap: {
      int: '1000',
      float: '0.000001',
    },
    transfer: {
      int: '2000',
      float: '0.000002',
    },
  },
  exchangeRate: '1.02',
  abrExchangeRate: '0.98',
  sourceNativeTokenPrice: '3200.15',
};

export const PENDING_STATUS_INFO_EXAMPLE = {
  pendingTxs: 2,
  pendingAmount: {
    int: '2500000',
    float: '2.5',
  },
  estimatedAmount: {
    min: {
      int: '997000',
      float: '0.997',
    },
    max: {
      int: '999000',
      float: '0.999',
    },
  },
};

export const TRANSFER_STATUS_EXAMPLE = {
  txId: '0x1234',
  sourceChainSymbol: 'ETH',
  destinationChainSymbol: 'TRX',
  sendAmount: '1000000',
  sendAmountFormatted: 1,
  stableFee: '1000',
  stableFeeFormatted: 0.001,
  sourceTokenAddress: '0x0000000000000000000000000000000000000001',
  destinationTokenAddress: 'T1111111111111111111111111111111111',
  senderAddress: '0x0000000000000000000000000000000000000002',
  recipientAddress: 'T2222222222222222222222222222222222',
  signaturesCount: 2,
  signaturesNeeded: 4,
  send: {
    txId: '0x1234',
    sourceChainId: 1,
    destinationChainId: 728126428,
    fee: '1000',
    feeFormatted: 0.001,
    stableFee: '1000',
    stableFeeFormatted: 0.001,
    amount: '1000000',
    amountFormatted: 1,
    virtualAmount: '999000',
    bridgeContract: '0x0000000000000000000000000000000000000003',
    sender: '0x0000000000000000000000000000000000000002',
    recipient: 'T2222222222222222222222222222222222',
    sourceTokenAddress: '0x0000000000000000000000000000000000000001',
    destinationTokenAddress: 'T1111111111111111111111111111111111',
    hash: '0xhash',
    messenger: 'ALLBRIDGE',
    blockTime: 1710000000,
    blockId: '0xblock',
  },
  receive: {
    txId: '0x5678',
    sourceChainId: 1,
    destinationChainId: 728126428,
    fee: '1000',
    feeFormatted: 0.001,
    stableFee: '1000',
    stableFeeFormatted: 0.001,
    amount: '999000',
    amountFormatted: 0.999,
    virtualAmount: '999000',
    bridgeContract: 'T3333333333333333333333333333333333',
    sender: '0x0000000000000000000000000000000000000002',
    recipient: 'T2222222222222222222222222222222222',
    sourceTokenAddress: '0x0000000000000000000000000000000000000001',
    destinationTokenAddress: 'T1111111111111111111111111111111111',
    hash: '0xreceivehash',
    messenger: 'ALLBRIDGE',
    blockTime: 1710000030,
    blockId: '0xreceiveblock',
  },
  responseTime: 42,
};

export const BRIDGE_QUOTE_EXAMPLE: BridgeQuoteResponse = {
  amountInt: '100500000',
  amountFloat: '100.5',
  sourceTokenAddress: '0x0000000000000000000000000000000000000001',
  destinationTokenAddress: 'T1111111111111111111111111111111111',
  options: [
    {
      messenger: 'ALLBRIDGE',
      messengerIndex: Messenger.ALLBRIDGE,
      estimatedTimeMs: 90000,
      paymentMethods: [
        {
          feePaymentMethod: 'WITH_NATIVE_CURRENCY',
          fee: '5000',
          pendingTxs: 2,
          pendingAmount: '2500000',
          estimatedAmount: { min: '100100000', max: '100100000' },
          relayerFeeInNative: '5000',
          poolImpact: SWAP_CALC_INFO_EXAMPLE,
          lpFeeTotal: '-500',
        },
        {
          feePaymentMethod: 'WITH_STABLECOIN',
          fee: '1200',
          pendingTxs: 2,
          pendingAmount: '2500000',
          estimatedAmount: { min: '99890000', max: '99890000' },
          relayerFeeInStable: '1200',
          poolImpact: SWAP_CALC_INFO_EXAMPLE,
          lpFeeTotal: '-500',
        },
        {
          feePaymentMethod: 'WITH_ABR',
          fee: '980',
          pendingTxs: 2,
          pendingAmount: '2500000',
          estimatedAmount: { min: '100100000', max: '100100000' },
          relayerFeeInAbr: '980',
          abrPayerAddress: '0x00000000000000000000000000000000000000ab',
          abrTokenAddress: '0x00000000000000000000000000000000000000cd',
          poolImpact: SWAP_CALC_INFO_EXAMPLE,
          lpFeeTotal: '-500',
        },
      ],
    },
    {
      messenger: 'WORMHOLE',
      messengerIndex: Messenger.WORMHOLE,
      estimatedTimeMs: 120000,
      paymentMethods: [
        {
          feePaymentMethod: 'WITH_NATIVE_CURRENCY',
          fee: '5500',
          estimatedAmount: { min: '100050000', max: '100050000' },
          relayerFeeInNative: '5500',
          poolImpact: SWAP_CALC_INFO_EXAMPLE,
          lpFeeTotal: '-500',
        },
      ],
    },
    {
      messenger: 'CCTP',
      messengerIndex: Messenger.CCTP,
      estimatedTimeMs: 300000,
      paymentMethods: [
        {
          feePaymentMethod: 'WITH_NATIVE_CURRENCY',
          fee: '6000',
          estimatedAmount: { min: '100000000', max: '100000000' },
          relayerFeeInNative: '6000',
          transferFee: '250',
        },
      ],
    },
    {
      messenger: 'CCTP_V2',
      messengerIndex: Messenger.CCTP_V2,
      estimatedTimeMs: 240000,
      paymentMethods: [
        {
          feePaymentMethod: 'WITH_NATIVE_CURRENCY',
          fee: '5800',
          estimatedAmount: { min: '100020000', max: '100020000' },
          relayerFeeInNative: '5800',
          transferFee: '220',
        },
      ],
    },
    {
      messenger: 'OFT',
      messengerIndex: Messenger.OFT,
      estimatedTimeMs: 150000,
      paymentMethods: [
        {
          feePaymentMethod: 'WITH_NATIVE_CURRENCY',
          fee: '5100',
          estimatedAmount: { min: '100080000', max: '100080000' },
          relayerFeeInNative: '5100',
          transferFee: '0',
        },
      ],
    },
    {
      messenger: 'X_RESERVE',
      messengerIndex: Messenger.X_RESERVE,
      estimatedTimeMs: 60000,
      paymentMethods: [
        {
          feePaymentMethod: 'WITH_NATIVE_CURRENCY',
          fee: '4500',
          estimatedAmount: { min: '99950000', max: '99950000' },
          relayerFeeInNative: '4500',
          transferFee: '0',
        },
      ],
    },
  ],
};

export const STELLAR_BALANCE_LINE_EXAMPLE = {
  balance: '10.5',
  limit: '1000000',
  asset_type: 'credit_alphanum12' as const,
  asset_code: 'USDC',
  asset_issuer: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  buying_liabilities: '0.0',
  selling_liabilities: '0.0',
  last_modified_ledger: 123456,
  is_authorized: true,
  is_authorized_to_maintain_liabilities: true,
  is_clawback_enabled: false,
};

export const ALGORAND_RAW_OPT_IN_EXAMPLE = [
  '82a3736967c4400000000000000000000000000000000000000000000000000000000000000000',
];

export const POOL_INFO_EXAMPLE = {
  aValue: '100',
  dValue: '2000000',
  tokenBalance: '1500000',
  vUsdBalance: '1499000',
  totalLpAmount: '3000000',
  accRewardPerShareP: '42',
  p: 48,
  imbalance: '0.0001',
};

export const USER_POOL_INFO_EXAMPLE = {
  lpAmount: '12.5',
  rewardDebt: '0.03',
};

export const YIELD_TOKEN_EXAMPLE = {
  chainSymbol: 'ETH',
  chainId: '1',
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6,
  tokenAddress: '0x0000000000000000000000000000000000000001',
  yieldAddress: '0x0000000000000000000000000000000000000002',
  tokens: [
    {
      chainSymbol: 'ETH',
      chainId: '1',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      tokenAddress: '0x0000000000000000000000000000000000000001',
      yieldAddress: '0x0000000000000000000000000000000000000002',
      yieldId: '1',
    },
  ],
};

export const YIELD_WITHDRAW_AMOUNT_EXAMPLE = [
  {
    amount: '1.25',
    token: {
      chainSymbol: 'ETH',
      chainId: '1',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      tokenAddress: '0x0000000000000000000000000000000000000001',
      yieldAddress: '0x0000000000000000000000000000000000000002',
      yieldId: '1',
    },
  },
];
