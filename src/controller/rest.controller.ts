import {
  AmountFormat,
  AmountFormatted,
  ChainDetailsMap,
  ChainSymbol,
  CheckAddressResponse,
  ExtraGasMaxLimitResponse,
  GasBalanceResponse,
  GasFeeOptions,
  GetNativeTokenBalanceParams,
  GetTokenBalanceParams,
  LiquidityPoolsParams,
  Messenger,
  PendingStatusInfoResponse,
  PoolInfo,
  SendParams,
  SwapParams,
  TokenWithChainDetails,
  UserBalanceInfo,
} from '@allbridge/bridge-core-sdk';
import {
  FeePaymentMethod,
  TransferStatusResponse,
} from '@allbridge/bridge-core-sdk/dist/src/models';
import { LiquidityPoolsParamsWithAmount } from '@allbridge/bridge-core-sdk/dist/src/services/liquidity-pool/models/pool.model';
import { Controller, Get, Query } from '@nestjs/common';
import { VersionedTransaction } from '@solana/web3.js';
import { Example, Route, Tags } from 'tsoa';
import { TransactionConfig } from 'web3-core';
import {
  BridgeAmounts,
  SDKService,
  SwapCalcInfo,
} from '../service/sdk.service';

type RawTransaction =
  | VersionedTransaction
  | TransactionConfig
  | object
  | string;

@Controller()
@Route()
export class RestController {
  constructor(private readonly sdkService: SDKService) {}

  /**
   * Returns ChainDetailsMap containing a list of supported tokens groped by chain.
   */
  @Get('/chains')
  @Tags('Tokens')
  async chainDetailsMap(): Promise<ChainDetailsMap> {
    return this.sdkService.chainDetailsMap();
  }

  /**
   * Returns a list of supported tokens.
   */
  @Get('/tokens')
  @Tags('Tokens')
  async getTokens(): Promise<TokenWithChainDetails[]> {
    return this.sdkService.getTokens();
  }

  /**
   * Creates a Raw Transaction for approving tokens usage by the bridge
   */
  @Get('/raw/approve')
  @Tags('Tokens', 'Pool', 'Transfers', 'Raw Transactions')
  async approve(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
    /**
     * The integer amount of tokens to approve.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>The maximum amount by default.</b>
     */
    @Query('amount') amount?: string,
  ): Promise<RawTransaction> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    return await this.sdkService.approve({
      token: poolAddressObj,
      owner: ownerAddress,
      amount: amount,
    });
  }

  /**
   * Creates a Raw Transaction for initiating the swap of tokens on one chain
   */
  @Get('/raw/swap')
  @Tags('Transfers', 'Raw Transactions')
  async getRawSwap(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    @Query('sender') sender: string,
    @Query('recipient') recipient: string,
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
    /**
     * minimumReceiveAmount: Integer value according to the source token precision
     * see AllbridgeCoreSdk#getAmountToBeReceived
     */
    @Query('minimumReceiveAmount') minimumReceiveAmount?: string,
  ): Promise<RawTransaction> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    const floatAmount = parseFloat(amount) / 10 ** sourceTokenObj.decimals;
    const minimumReceiveAmountFloat = (
      parseFloat(minimumReceiveAmount) /
      10 ** destinationTokenObj.decimals
    ).toString();
    return await this.sdkService.send(<SwapParams>{
      amount: floatAmount.toString(),
      destinationToken: destinationTokenObj,
      fromAccountAddress: sender,
      minimumReceiveAmount: minimumReceiveAmount
        ? minimumReceiveAmountFloat
        : undefined,
      sourceToken: sourceTokenObj,
      toAccountAddress: recipient,
    });
  }

  /**
   * Creates a Raw Transaction for initiating the transfer of tokens from one chain to another. <br/>
   */
  @Get('/raw/bridge')
  @Tags('Transfers', 'Raw Transactions')
  @Example<TransactionConfig>(
    {
      from: '0x0000000000000000000000000000000000000000',
      to: '0x0000000000000000000000000000000000000000',
      value: '1000',
      data: '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    },
    'EVM transaction',
  )
  @Example<object>(
    {
      signatures: [{ '0': 0 }],
      message: {
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 2,
        },
        staticAccountKeys: [
          '00000000000000000000000000000000000000000000',
          '11111111111111111111111111111111111111111111',
          'ComputeBudget111111111111111111111111111111',
          'BrdgBrdgBrdgBrdgBrdgBrdgBrdgBrdgBrdgBrdgBrdg',
        ],
        recentBlockhash: '9tmV9tmV9tmV9tmV9tmV9tmV9tmV9tmV9tmV9tmV9tmV',
        compiledInstructions: [
          {
            programIdIndex: 2,
            accountKeyIndexes: [],
            data: {
              type: 'Buffer',
              data: [0, 0, 0, 0, 0],
            },
          },
          {
            programIdIndex: 3,
            accountKeyIndexes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            data: {
              type: 'Buffer',
              data: [
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0,
              ],
            },
          },
        ],
        addressTableLookups: [
          {
            accountKey: '33333333333333333333333333333333333333333333',
            writableIndexes: [0, 0, 0],
            readonlyIndexes: [0, 0, 0],
          },
        ],
      },
    },
    'Solana transaction',
  )
  @Example<object>(
    {
      visible: false,
      txID: '0000000000000000000000000000000000000000000000000000000000000000',
      raw_data: {
        contract: [
          {
            parameter: {
              value: {
                data: '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
                owner_address: '000000000000000000000000000000000000000000',
                contract_address: '000000000000000000000000000000000000000000',
                call_value: 0,
              },
              type_url: 'type.googleapis.com/protocol.TriggerSmartContract',
            },
            type: 'TriggerSmartContract',
          },
        ],
        ref_block_bytes: '1111',
        ref_block_hash: '1234567812345678',
        expiration: 1111111111111,
        fee_limit: 111111111,
        timestamp: 1111111111111,
      },
      raw_data_hex:
        '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    },
    'Tron transaction',
  )
  async getRawSwapAndBridge(
    /**
     * The integer amount according to the source token precision of Total tokens to transfer.<br/>
     */
    @Query('amount') amount: string,
    @Query('sender') sender: string,
    @Query('recipient') recipient: string,
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
    /**
     * Payment method for the gas fee and extra gas payment.<br/>
     * <b><u>WITH_NATIVE_CURRENCY</u></b> - gas fee and extra gas will be added to transaction as native tokens value <br/>
     * <b><u>WITH_STABLECOIN</u></b> - gas fee and extra gas will be deducted from the transaction amount<br/>
     */
    @Query('feePaymentMethod') feePaymentMethod: keyof typeof FeePaymentMethod,
    /**
     * The amount of gas fee to pay for the transfer. <br/>
     * If <i>feePaymentMethod</i> is <b><u>WITH_NATIVE_CURRENCY</u></b> then it is amount of the source chain currency. <br/>
     * If <i>feePaymentMethod</i> is <b><u>WITH_STABLECOIN</u></b> then it is amount of the source token. <br/>
     * If not defined, the default fee amount will be applied according to feePaymentMethod.<br/>
     * See <a href="/api#/Tokens/GetGasFeeOptions" target="_blank">/gas/fee</a> to get required gas fee amount.
     */
    @Query('fee') fee?: string,
    /**
     * The amount of extra gas to transfer to gas on destination chain with the transfer.<br/>
     * If <i>feePaymentMethod</i> is <b><u>WITH_NATIVE_CURRENCY</u></b> then it is amount of the source chain currency.<br/>
     * if <i>feePaymentMethod</i> is <b><u>WITH_STABLECOIN</u></b> then it is amount of the source token.<br/>
     * To get maximum supported value, look <a href="/api#/Tokens/GetExtraGasMaxLimits" target="_blank">/gas/extra/limits</a><br/>
     */
    @Query('extraGas')
    extraGas?: string,
  ): Promise<RawTransaction> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    const feePaymentMethodEnum =
      FeePaymentMethod[feePaymentMethod as keyof typeof FeePaymentMethod];
    const amountFloat = parseFloat(amount) / 10 ** sourceTokenObj.decimals;
    return await this.sdkService.send(<SendParams>{
      amount: amountFloat.toString(),
      destinationToken: destinationTokenObj,
      fromAccountAddress: sender,
      sourceToken: sourceTokenObj,
      toAccountAddress: recipient,
      messenger: messengerEnum,
      fee: fee,
      feeFormat: AmountFormat.INT,
      extraGas: extraGas,
      extraGasFormat: AmountFormat.INT,
      gasFeePaymentMethod: feePaymentMethodEnum,
    });
  }

  /**
   * Gets the average time in ms to complete a transfer for given tokens and messenger.
   */
  @Get('/transfer/time')
  @Tags('Transfers')
  async getTransferTime(
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
  ): Promise<number | null> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    return this.sdkService.getTransferTime(
      sourceTokenObj,
      destinationTokenObj,
      messengerEnum,
    );
  }

  /**
   * Fetches information about tokens transfer by chosen chainSymbol and transaction Id from the Allbridge Core API.
   */
  @Get('/transfer/status')
  @Tags('Transfers')
  async getTransferStatus(
    @Query('chain') chain: keyof typeof ChainSymbol,
    @Query('txId') txId: string,
  ): Promise<TransferStatusResponse> {
    const chainEnum = ChainSymbol[chain as keyof typeof ChainSymbol];
    return await this.sdkService.getTransferStatus(chainEnum, txId);
  }

  /**
   * Get token balance
   */
  @Get('/token/balance')
  @Tags('Tokens')
  async getTokenBalance(
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<{ result: string }> {
    const tokenObj = await this.sdkService.getTokenByAddress(token);
    return {
      result: await this.sdkService.getTokenBalance(<GetTokenBalanceParams>{
        account: address,
        token: tokenObj,
      }),
    };
  }

  /**
   * Get native (gas) token balance
   */
  @Get('/token/native/balance')
  @Tags('Tokens')
  async getTokenNativeBalance(
    @Query('address') address: string,
    @Query('chain') chain: keyof typeof ChainSymbol,
  ): Promise<AmountFormatted> {
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    return await this.sdkService.getNativeTokenBalance(<
      GetNativeTokenBalanceParams
    >{
      account: address,
      chainSymbol: chainSymbol,
    });
  }

  @Get('/token/details')
  @Tags('Tokens')
  async getTokenByChainAndAddress(
    @Query('address') address: string,
    @Query('chain') chain: keyof typeof ChainSymbol,
  ): Promise<TokenWithChainDetails | undefined> {
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    return await this.sdkService.getTokenByChainAndAddress(
      chainSymbol,
      address,
    );
  }

  /**
   * Fetches possible ways to pay the transfer gas fee.
   */
  @Get('/gas/fee')
  @Tags('Tokens')
  async getGasFeeOptions(
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
  ): Promise<GasFeeOptions> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    return await this.sdkService.getGasFeeOptions(
      <TokenWithChainDetails>sourceTokenObj,
      <TokenWithChainDetails>destinationTokenObj,
      messengerEnum,
    );
  }

  /**
   * Get gas balance
   */
  @Get('/gas/balance')
  @Tags('Tokens')
  async getGasBalance(
    @Query('address') address: string,
    @Query('chain') chain: keyof typeof ChainSymbol,
  ): Promise<GasBalanceResponse> {
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    return await this.sdkService.getGasBalance(chainSymbol, address);
  }

  /**
   * Get possible limit of extra gas amount.
   */
  @Get('/gas/extra/limits')
  @Tags('Tokens')
  async getExtraGasMaxLimits(
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
  ): Promise<ExtraGasMaxLimitResponse> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    return await this.sdkService.getExtraGasMaxLimits(
      <TokenWithChainDetails>sourceTokenObj,
      <TokenWithChainDetails>destinationTokenObj,
    );
  }

  /**
   * Returns information about pending transactions for the same destination chain and the amount of tokens can be received as a result of transfer considering pending transactions.
   */
  @Get('/pending/info')
  @Tags('Transfers')
  async getPendingStatusInfo(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
  ): Promise<PendingStatusInfoResponse> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    return await this.sdkService.getPendingStatusInfo(
      amount,
      AmountFormat.INT,
      <TokenWithChainDetails>sourceTokenObj,
      <TokenWithChainDetails>destinationTokenObj,
    );
  }

  /**
   * Show swap amount changes (fee and amount adjustment) during send through pools
   */
  @Get('/swap/details')
  @Tags('Transfers')
  async swapDetails(
    /**
     * Amount to be received: Integer value according to the destination token precision
     */
    @Query('amount') amount: string,
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
  ): Promise<SwapCalcInfo> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    return await this.sdkService.swapAndBridgeDetails(
      amount,
      AmountFormat.INT,
      sourceTokenObj,
      destinationTokenObj,
    );
  }

  /**
   * Show bridge amount changes (fee and amount adjustment) during send through pools on source and destination chains
   */
  @Get('/bridge/details')
  @Tags('Transfers')
  async bridgeDetails(
    /**
     * Amount to be received: Integer value according to the destination token precision
     */
    @Query('amount') amount: string,
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
  ): Promise<SwapCalcInfo> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    return await this.sdkService.swapAndBridgeDetails(
      amount,
      AmountFormat.INT,
      sourceTokenObj,
      destinationTokenObj,
    );
  }

  /**
   * Calculates the amount of tokens to be received as a result of transfer.
   */
  @Get('/bridge/receive/calculate')
  @Tags('Transfers')
  async getAmountToBeReceived(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
    @Query('refreshingPools') refreshingPools?: boolean,
    /**
     * Integer value according to the source token precision<br/>
     * <i><u>*Optional</u></i>:<i><u>If provided, the fee will be deducted from the transaction amount</u></i>
     */
    @Query('relayerFeeInStables') relayerFeeInStables?: string,
  ): Promise<BridgeAmounts> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    const feeFloat = relayerFeeInStables
      ? (
          parseFloat(relayerFeeInStables) /
          10 ** sourceTokenObj.decimals
        ).toString()
      : undefined;
    return await this.sdkService.getAmountToBeReceived(
      amount,
      sourceTokenObj,
      destinationTokenObj,
      messengerEnum,
      refreshingPools ?? false,
      feeFloat,
    );
  }

  /**
   * Calculates the amount of tokens to send based on requested tokens amount be received as a result of transfer.
   */
  @Get('/bridge/send/calculate')
  @Tags('Transfers')
  async getAmountToSend(
    /**
     * Amount to be received: Integer value according to the destination token precision
     */
    @Query('amount') amount: string,
    /**
     * selected token on the source chain.
     */
    @Query('sourceToken') sourceToken: string,
    /**
     * selected token on the destination chain.
     */
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
    @Query('refreshingPools') refreshingPools?: boolean,
    /**
     * Integer value according to the source token precision<br/>
     * <i><u>*Optional</u></i>:<i><u>If provided, the fee will be deducted from the transaction amount</u></i>
     */
    @Query('relayerFeeInStables') relayerFeeInStables?: string,
  ): Promise<BridgeAmounts> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    const feeFloat = relayerFeeInStables
      ? (
          parseFloat(relayerFeeInStables) /
          10 ** sourceTokenObj.decimals
        ).toString()
      : undefined;
    return await this.sdkService.getAmountToSend(
      amount,
      sourceTokenObj,
      destinationTokenObj,
      messengerEnum,
      refreshingPools ?? false,
      feeFloat,
    );
  }

  /**
   * Creates a Raw Transaction for depositing tokens to Liquidity pool
   */
  @Get('/raw/deposit')
  @Tags('Pool', 'Raw Transactions')
  async deposit(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    return await this.sdkService.deposit(<LiquidityPoolsParamsWithAmount>{
      amount: amount.toString(),
      accountAddress: ownerAddress,
      token: tokenAddressObj,
    });
  }

  /**
   * Creates a Raw Transaction for withdrawing tokens from Liquidity pool
   */
  @Get('/raw/withdraw')
  @Tags('Pool', 'Raw Transactions')
  async withdraw(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    return await this.sdkService.withdraw(<LiquidityPoolsParamsWithAmount>{
      amount: amount.toString(),
      accountAddress: ownerAddress,
      token: tokenAddressObj,
    });
  }

  /**
   * Creates a Raw Transaction for claiming rewards from Liquidity pool
   */
  @Get('/raw/claim')
  @Tags('Pool', 'Raw Transactions')
  async claimRewards(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    return await this.sdkService.claimRewards(<LiquidityPoolsParams>{
      accountAddress: ownerAddress,
      token: tokenAddressObj,
    });
  }

  /**
   * Check address and show gas balance
   */
  @Get('/check/address')
  @Tags('Tokens', 'Transfers')
  async checkAddress(
    @Query('chain') chain: keyof typeof ChainSymbol,
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<CheckAddressResponse> {
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    return await this.sdkService.checkAddress(chainSymbol, address, token);
  }

  /**
   * Check if the amount of approved tokens is enough
   */
  @Get('/check/allowance')
  @Tags('Pool', 'Transfers')
  async checkAllowance(
    /**
     * Amount: Integer value according to the token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
  ): Promise<boolean> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    const feePaymentMethodEnum =
      FeePaymentMethod[feePaymentMethod as keyof typeof FeePaymentMethod];
    const floatAmount = parseFloat(amount) / 10 ** poolAddressObj.decimals;
    return await this.sdkService.checkAllowance({
      amount: floatAmount.toString(),
      owner: ownerAddress,
      token: poolAddressObj,
      gasFeePaymentMethod: feePaymentMethodEnum,
    });
  }

  /**
   * Gets information about the pool-info by token from server
   */
  @Get('/pool/info/server')
  @Tags('Pool')
  async getPoolInfoByServer(
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
  ): Promise<PoolInfo> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    return await this.sdkService.getPoolInfoFromServer(poolAddressObj);
  }

  /**
   * Gets information about the pool-info by token from blockchain
   */
  @Get('/pool/info/blockchain')
  @Tags('Pool')
  async getPoolInfoFromBlockchain(
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
  ): Promise<Required<PoolInfo>> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    return await this.sdkService.getPoolInfoFromBlockchain(poolAddressObj);
  }

  /**
   * Get amount of tokens approved for poolInfo
   */
  @Get('/pool/allowance')
  @Tags('Pool')
  async getPoolAllowance(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
  ): Promise<string> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    const feePaymentMethodEnum =
      FeePaymentMethod[feePaymentMethod as keyof typeof FeePaymentMethod];
    return await this.sdkService.getPoolAllowance({
      owner: ownerAddress,
      token: poolAddressObj,
      gasFeePaymentMethod: feePaymentMethodEnum,
    });
  }

  /**
   * Get user balance info on liquidity pool
   */
  @Get('/liquidity/details')
  @Tags('Pool')
  async getUserPoolInfo(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
  ): Promise<UserBalanceInfo> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    return await this.sdkService.getUserPoolInfo(ownerAddress, poolAddressObj);
  }

  /**
   * Calculates the amount of LP tokens that will be deposited
   */
  @Get('/liquidity/deposit/calculate')
  @Tags('Pool')
  async getAmountToBeDeposited(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<string> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    return await this.sdkService.getAmountToBeDeposited(
      amount,
      tokenAddressObj,
    );
  }

  /**
   * Calculates the amount of tokens will be withdrawn
   */
  @Get('/liquidity/withdrawn/calculate')
  @Tags('Pool')
  async getAmountToBeWithdrawn(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<string> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    const floatAmount = parseFloat(amount) / 10 ** tokenAddressObj.decimals;
    return await this.sdkService.getAmountToBeWithdrawn(
      floatAmount.toString(),
      ownerAddress,
      tokenAddressObj,
    );
  }
}
