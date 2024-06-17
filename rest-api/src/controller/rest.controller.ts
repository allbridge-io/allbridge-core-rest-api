import {
  AmountFormat,
  AmountFormatted,
  ChainDetailsMap,
  ChainSymbol,
  CheckAddressResponse,
  ExtraGasMaxLimitResponse,
  FeePaymentMethod,
  GasBalanceResponse,
  GasFeeOptions,
  Messenger,
  PendingStatusInfoResponse,
  PoolInfo,
  TokenWithChainDetails,
  TransferStatusResponse,
  UserBalanceInfo,
} from '@allbridge/bridge-core-sdk';
import {
  Controller,
  Get,
  HttpException,
  HttpExceptionBody,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { VersionedTransaction } from '@solana/web3.js';
import { HorizonApi } from '@stellar/stellar-sdk/lib/horizon/horizon_api';
import { Example, Response, Route, Tags } from 'tsoa';
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
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/chains')
  @Tags('Tokens')
  async chainDetailsMap(): Promise<ChainDetailsMap> {
    try {
      return this.sdkService.chainDetailsMap();
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Returns a list of supported tokens.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/tokens')
  @Tags('Tokens')
  async getTokens(): Promise<TokenWithChainDetails[]> {
    try {
      return this.sdkService.getTokens();
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Creates a Raw Transaction for approving tokens usage by the bridge
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/approve')
  @Tags('Tokens', 'Pool', 'Transfers', 'Raw Transactions')
  async approve(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
    /**
     * The integer amount of tokens to approve.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>The maximum amount by default.</b>
     */
    @Query('amount') amount?: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.approve({
        token: tokenAddressObj,
        owner: ownerAddress,
        amount: amount,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Creates a Raw Transaction for initiating the swap of tokens on one chain
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    const floatAmount = parseFloat(amount) / 10 ** sourceTokenObj.decimals;
    if (isNaN(floatAmount)) {
      throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
    }
    const minimumReceiveAmountFloat =
      parseFloat(minimumReceiveAmount) / 10 ** destinationTokenObj.decimals;
    if (isNaN(minimumReceiveAmountFloat)) {
      throw new HttpException(
        'Invalid minimumReceiveAmount',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.sdkService.send({
        amount: floatAmount.toString(),
        destinationToken: destinationTokenObj,
        fromAccountAddress: sender,
        minimumReceiveAmount: minimumReceiveAmount
          ? minimumReceiveAmountFloat.toString()
          : undefined,
        sourceToken: sourceTokenObj,
        toAccountAddress: recipient,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Creates a Raw Transaction for initiating the transfer of tokens from one chain to another. <br/>
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
  @Example<string>(
    '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    'Solana transaction',
  )
  @Example<string>(
    '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    'Stellar transaction',
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!Object.keys(Messenger).includes(messenger)) {
      throw new HttpException('Invalid messenger', HttpStatus.BAD_REQUEST);
    }
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];

    if (!Object.keys(FeePaymentMethod).includes(feePaymentMethod)) {
      throw new HttpException(
        'Invalid feePaymentMethod',
        HttpStatus.BAD_REQUEST,
      );
    }
    const feePaymentMethodEnum =
      FeePaymentMethod[feePaymentMethod as keyof typeof FeePaymentMethod];
    const amountFloat = parseFloat(amount) / 10 ** sourceTokenObj.decimals;
    if (isNaN(amountFloat) || amountFloat <= 0) {
      throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.send({
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
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Simulate and check if restore needed for Stellar transaction <br/>
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/stellar/restore/')
  @Tags('Transfers', 'Raw Transactions')
  async simulateAndCheckRestoreTxRequiredSoroban(
    @Query('xdrTx') xdrTx: string,
    @Query('sender') sender: string,
  ): Promise<string> {
    try {
      return await this.sdkService.simulateAndCheckRestoreTxRequiredSoroban(
        xdrTx,
        sender,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Gets the average time in ms to complete a transfer for given tokens and messenger.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Object.keys(Messenger).includes(messenger)) {
      throw new HttpException('Invalid messenger', HttpStatus.BAD_REQUEST);
    }
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    try {
      return this.sdkService.getTransferTime(
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Fetches information about tokens transfer by chosen chainSymbol and transaction Id from the Allbridge Core API.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/transfer/status')
  @Tags('Transfers')
  async getTransferStatus(
    @Query('chain') chain: keyof typeof ChainSymbol,
    @Query('txId') txId: string,
  ): Promise<TransferStatusResponse> {
    if (!Object.keys(ChainSymbol).includes(chain)) {
      throw new HttpException('Invalid chain', HttpStatus.BAD_REQUEST);
    }
    const chainEnum = ChainSymbol[chain as keyof typeof ChainSymbol];
    try {
      return await this.sdkService.getTransferStatus(chainEnum, txId);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get token balance
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/token/balance')
  @Tags('Tokens')
  async getTokenBalance(
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<{ result: string }> {
    const tokenObj = await this.sdkService.getTokenByAddress(token);
    if (!tokenObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return {
        result: await this.sdkService.getTokenBalance({
          account: address,
          token: tokenObj,
        }),
      };
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get native (gas) token balance
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/token/native/balance')
  @Tags('Tokens')
  async getTokenNativeBalance(
    @Query('address') address: string,
    @Query('chain') chain: keyof typeof ChainSymbol,
  ): Promise<AmountFormatted> {
    if (!Object.keys(ChainSymbol).includes(chain)) {
      throw new HttpException('Invalid chain', HttpStatus.BAD_REQUEST);
    }
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    try {
      return await this.sdkService.getNativeTokenBalance({
        account: address,
        chainSymbol: chainSymbol,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/token/details')
  @Tags('Tokens')
  async getTokenByChainAndAddress(
    @Query('address') address: string,
    @Query('chain') chain: keyof typeof ChainSymbol,
  ): Promise<TokenWithChainDetails | undefined> {
    if (!Object.keys(ChainSymbol).includes(chain)) {
      throw new HttpException('Invalid chain', HttpStatus.BAD_REQUEST);
    }
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    try {
      return await this.sdkService.getTokenByChainAndAddress(
        chainSymbol,
        address,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Fetches possible ways to pay the transfer gas fee.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Object.keys(Messenger).includes(messenger)) {
      throw new HttpException('Invalid messenger', HttpStatus.BAD_REQUEST);
    }
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    try {
      return await this.sdkService.getGasFeeOptions(
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get gas balance
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/gas/balance')
  @Tags('Tokens')
  async getGasBalance(
    @Query('address') address: string,
    @Query('chain') chain: keyof typeof ChainSymbol,
  ): Promise<GasBalanceResponse> {
    if (!Object.keys(ChainSymbol).includes(chain)) {
      throw new HttpException('Invalid chain', HttpStatus.BAD_REQUEST);
    }
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    try {
      return await this.sdkService.getGasBalance(chainSymbol, address);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get possible limit of extra gas amount.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/gas/extra/limits')
  @Tags('Tokens')
  async getExtraGasMaxLimits(
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
  ): Promise<ExtraGasMaxLimitResponse> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.sdkService.getExtraGasMaxLimits(
        sourceTokenObj,
        destinationTokenObj,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Returns information about pending transactions for the same destination chain and the amount of tokens can be received as a result of transfer considering pending transactions.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.sdkService.getPendingStatusInfo(
        amount,
        AmountFormat.INT,
        sourceTokenObj,
        destinationTokenObj,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Show swap amount changes (fee and amount adjustment) during send through pools
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.sdkService.swapAndBridgeDetails(
        amount,
        AmountFormat.INT,
        sourceTokenObj,
        destinationTokenObj,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Show bridge amount changes (fee and amount adjustment) during send through pools on source and destination chains
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return await this.sdkService.swapAndBridgeDetails(
        amount,
        AmountFormat.INT,
        sourceTokenObj,
        destinationTokenObj,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Calculates the amount of tokens to be received as a result of transfer.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Object.keys(Messenger).includes(messenger)) {
      throw new HttpException('Invalid messenger', HttpStatus.BAD_REQUEST);
    }
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    const feeFloat = relayerFeeInStables
      ? (
          parseFloat(relayerFeeInStables) /
          10 ** sourceTokenObj.decimals
        ).toString()
      : undefined;
    try {
      return await this.sdkService.getAmountToBeReceived(
        amount,
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
        refreshingPools ?? false,
        feeFloat,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Calculates the amount of tokens to send based on requested tokens amount be received as a result of transfer.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Object.keys(Messenger).includes(messenger)) {
      throw new HttpException('Invalid messenger', HttpStatus.BAD_REQUEST);
    }
    const messengerEnum = Messenger[messenger as keyof typeof Messenger];
    const feeFloat = relayerFeeInStables
      ? (
          parseFloat(relayerFeeInStables) /
          10 ** sourceTokenObj.decimals
        ).toString()
      : undefined;
    try {
      return await this.sdkService.getAmountToSend(
        amount,
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
        refreshingPools ?? false,
        feeFloat,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Creates a Raw Transaction for depositing tokens to Liquidity pool
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.deposit({
        amount: amount.toString(),
        accountAddress: ownerAddress,
        token: tokenAddressObj,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Creates a Raw Transaction for withdrawing tokens from Liquidity pool
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.withdraw({
        amount: amount.toString(),
        accountAddress: ownerAddress,
        token: tokenAddressObj,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Creates a Raw Transaction for claiming rewards from Liquidity pool
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.claimRewards({
        accountAddress: ownerAddress,
        token: tokenAddressObj,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Check address and show gas balance
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/address')
  @Tags('Tokens', 'Transfers')
  async checkAddress(
    @Query('chain') chain: keyof typeof ChainSymbol,
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<CheckAddressResponse> {
    if (!Object.keys(ChainSymbol).includes(chain)) {
      throw new HttpException('Invalid chain', HttpStatus.BAD_REQUEST);
    }
    const chainSymbol = ChainSymbol[chain as keyof typeof ChainSymbol];
    try {
      return await this.sdkService.checkAddress(chainSymbol, address, token);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get Balance Line information if exists
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/stellar/balanceline')
  @Tags('Tokens', 'Transfers')
  async checkBalanceLine(
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<HorizonApi.BalanceLineAsset> {
    try {
      return await this.sdkService.checkBalanceLine(address, token);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Check if the amount of approved tokens is enough
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    @Query('tokenAddress') tokenAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
  ): Promise<boolean> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    if (!Object.keys(FeePaymentMethod).includes(feePaymentMethod)) {
      throw new HttpException(
        'Invalid feePaymentMethod',
        HttpStatus.BAD_REQUEST,
      );
    }
    const feePaymentMethodEnum =
      FeePaymentMethod[feePaymentMethod as keyof typeof FeePaymentMethod];
    const floatAmount = parseFloat(amount) / 10 ** tokenAddressObj.decimals;
    if (isNaN(floatAmount) || floatAmount <= 0) {
      throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.checkAllowance({
        amount: floatAmount.toString(),
        owner: ownerAddress,
        token: tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Gets information about the pool-info by token from server
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/pool/info/server')
  @Tags('Pool')
  async getPoolInfoByServer(
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
  ): Promise<PoolInfo> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    if (!poolAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getPoolInfoFromServer(poolAddressObj);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Gets information about the pool-info by token from blockchain
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/pool/info/blockchain')
  @Tags('Pool')
  async getPoolInfoFromBlockchain(
    /**
     * selected token on the source chain.
     */
    @Query('poolAddress') poolAddress: string,
  ): Promise<Required<PoolInfo>> {
    const poolAddressObj = await this.sdkService.getTokenByAddress(poolAddress);
    if (!poolAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getPoolInfoFromBlockchain(poolAddressObj);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get amount of tokens approved for poolInfo
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!poolAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    if (!Object.keys(FeePaymentMethod).includes(feePaymentMethod)) {
      throw new HttpException(
        'Invalid feePaymentMethod',
        HttpStatus.BAD_REQUEST,
      );
    }
    const feePaymentMethodEnum =
      FeePaymentMethod[feePaymentMethod as keyof typeof FeePaymentMethod];
    try {
      return await this.sdkService.getPoolAllowance({
        owner: ownerAddress,
        token: poolAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get user balance info on liquidity pool
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!poolAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getUserPoolInfo(
        ownerAddress,
        poolAddressObj,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Calculates the amount of LP tokens that will be deposited
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getAmountToBeDeposited(
        amount,
        tokenAddressObj,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Calculates the amount of tokens will be withdrawn
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
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
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    const floatAmount = parseFloat(amount) / 10 ** tokenAddressObj.decimals;
    if (isNaN(floatAmount) || floatAmount <= 0) {
      throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getAmountToBeWithdrawn(
        floatAmount.toString(),
        ownerAddress,
        tokenAddressObj,
      );
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
