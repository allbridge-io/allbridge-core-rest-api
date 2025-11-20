import {
  AmountFormat,
  AmountFormatted,
  ChainDetailsMap,
  ChainSymbol,
  CYDToken,
  EssentialWeb3Transaction,
  ExtraGasMaxLimitResponse,
  FeePaymentMethod,
  GasBalanceResponse,
  GasFeeOptions,
  Messenger,
  PendingStatusInfoResponse,
  PoolInfo,
  TokenWithChainDetails,
  TokenWithChainDetailsYield,
  TransferStatusResponse,
  YieldWithdrawAmount,
} from '@allbridge/bridge-core-sdk';
import {
  UserBalanceInfoDTO
} from '@allbridge/bridge-core-sdk/dist/src/services/liquidity-pool/models/pool.model';
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
import { Big } from 'big.js';
import { Example, Response, Route, Tags } from 'tsoa';
import { httpException } from '../error/errors';
import {
  BridgeAmounts,
  SDKService,
  SolanaTxFeeParamsMethod,
  SwapCalcInfo,
} from '../service/sdk.service';
import { convertIntAmountToFloat } from '../utils/calculation';

type RawTransaction =
  | VersionedTransaction
  | EssentialWeb3Transaction
  | object
  | string;

@Controller()
@Route()
export class RestController {
  constructor(private readonly sdkService: SDKService) {}

  /**
   * Returns a ChainDetailsMap containing a list of supported tokens grouped by chain.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/chains')
  @Tags('Tokens')
  async chainDetailsMap(
    /**
     * A string value which specifies ChainDetailsMap to retrieve. Can be either 'swap' for send or 'pool' for liquidity pools setup. Defaults to 'swap'.
     */
    @Query('type') type?: 'swap' | 'pool',
  ): Promise<ChainDetailsMap> {
    try {
      return this.sdkService.chainDetailsMap(type);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Returns a list of supported tokens.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/tokens')
  @Tags('Tokens')
  async getTokens(
    /**
     * A string value which specifies a set of tokens to retrieve. Can be either 'swap' for send or 'pool' for liquidity pools setup or 'yield' for CYD Tokens. Defaults to 'swap'.
     */
    @Query('type') type?: 'swap' | 'pool' | 'yield',
  ): Promise<CYDToken[] | TokenWithChainDetails[]> {
    try {
      if (type === 'yield') {
        return this.sdkService.getCYDTokens();
      }
      return this.sdkService.getTokens(type);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for approving token usage (default: bridge; optional: pool).
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/approve')
  @Tags('Pool', 'Transfers', 'Raw Transactions', 'Yield')
  async approve(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * Selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
    /**
     * The integer amount of tokens to approve.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>The maximum amount by default.</b>
     */
    @Query('amount') amount?: string,
    /**
     * The type of approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: bridge</b><br/>
     * Allowed values: `bridge`, `pool`
     */
    @Query('type') type: 'bridge' | 'pool' | 'yield' = 'bridge',
    /**
     * The Messengers for different routes to approve.<br/>
     * <i><u>Optional.</u></i><br/>
     * If <i>ALLBRIDGE</i> or <i>WORMHOLE</i> then Allbridge Contract is a <b>spender</b><br/>
     * If <i>CCTP</i> then CCTP Contract is a <b>spender</b><br/><br/>
     */
    @Query('messenger') messenger?: keyof typeof Messenger,
    /**
     * The spender contract address for the approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: Allbridge Contract</b><br/>
     * If specified, the approval will be made for the specified contract address.<br/>
     */
    @Query('contractAddress') contractAddress?: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj = await this.sdkService.getTokenByAddressAndType(tokenAddress, type);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }

    try {
      if (type === 'yield') {
        return await this.sdkService.yieldApprove({
          token: tokenAddressObj as TokenWithChainDetailsYield,
          owner: ownerAddress,
          amount: amount
        });
      }
      if (type === 'pool') {
        return await this.sdkService.poolApprove({
          token: tokenAddressObj,
          owner: ownerAddress,
          amount: amount,
        });
      }
      const messengerEnum = Messenger[messenger] || undefined;

      if (contractAddress !== undefined) {
        tokenAddressObj.bridgeAddress = contractAddress;
      }
      return await this.sdkService.bridgeApprove({
        token: tokenAddressObj,
        owner: ownerAddress,
        amount: amount,
        messenger: messengerEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }


  /**
   * Creates a Raw Transaction for approving token usage by the pool.
   *
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/pool/approve')
  @Tags('Pool', 'Raw Transactions')
  async poolApprove(
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
      return await this.sdkService.poolApprove({
        token: tokenAddressObj,
        owner: ownerAddress,
        amount: amount,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for approving token usage by the bridge
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/bridge/approve')
  @Tags('Transfers', 'Raw Transactions')
  async bridgeApprove(
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
    /**
     * The Messengers for different routes to approve.<br/>
     * <i><u>Optional.</u></i><br/>
     * If <i>ALLBRIDGE</i> or <i>WORMHOLE</i> then Allbridge Contract is a <b>spender</b><br/>
     * If <i>CCTP</i> then CCTP Contract is a <b>spender</b><br/><br/>
     */
    @Query('messenger') messenger?: keyof typeof Messenger,
    /**
     * The spender contract address for the approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: Allbridge Contract</b><br/>
     * If specified, the approval will be made for the specified contract address.<br/>
     */
    @Query('contractAddress') contractAddress?: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    if (contractAddress !== undefined) {
      tokenAddressObj.bridgeAddress = contractAddress;
    }
    const messengerEnum = Messenger[messenger] || undefined;
    try {
      return await this.sdkService.bridgeApprove({
        token: tokenAddressObj,
        owner: ownerAddress,
        amount: amount,
        messenger: messengerEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for initiating a swap of tokens on one chain.
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
    /**
     * Solana's transaction <a href="https://solana.com/docs/core/fees" target="_blank"> prioritization fee</a> parameters<br/>
     * <b><u>AUTO</u></b> - Priority Fee will be calculated based on <a href="https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getRecentPrioritizationFees" target="_blank">solana/web3.js:Connection.getRecentPrioritizationFees</a><br/>
     * <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> - Add Priority Fee as price per unit in micro-lamports<br/>
     * <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> - Total Priority Fee impact will be as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeParams')
    solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    /**
     * Solana's transaction prioritization fee parameter value<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>AUTO</u></b> then value is ignored<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> then string value represent Priority Fee as price per unit in micro-lamports<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> then string value represent Total Priority Fee as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
    /**
     * The spender contract address for the approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: Allbridge Contract</b><br/>
     * If specified, the approval will be made for the specified contract address.<br/>
     */
    @Query('contractAddress') contractAddress?: string,
  ): Promise<RawTransaction> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    if (contractAddress !== undefined) {
      sourceTokenObj.bridgeAddress = contractAddress;
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (sourceTokenObj.chainSymbol != destinationTokenObj.chainSymbol) {
      throw new HttpException(
        'For cross-chain swaps, please use the /raw/bridge endpoint.',
        HttpStatus.BAD_REQUEST
      );
    }
    let minimumReceiveAmountFloat: string;
    try {
      minimumReceiveAmountFloat = convertIntAmountToFloat(
        minimumReceiveAmount,
        destinationTokenObj.decimals,
      ).toFixed();
    } catch (ignoreError) {
      minimumReceiveAmountFloat = "0";
    }
    if (
      !!solanaTxFeeParams &&
      !Object.keys(SolanaTxFeeParamsMethod).includes(solanaTxFeeParams)
    ) {
      throw new HttpException(
        'Invalid solanaTxFeeParams',
        HttpStatus.BAD_REQUEST,
      );
    }
    const params = {
      amount: convertGt0IntAmountToFloat(amount, sourceTokenObj.decimals),
      destinationToken: destinationTokenObj,
      fromAccountAddress: sender,
      minimumReceiveAmount: minimumReceiveAmount
        ? minimumReceiveAmountFloat
        : undefined,
      sourceToken: sourceTokenObj,
      toAccountAddress: recipient,
    };
    if (!!solanaTxFeeParams && solanaTxFeeParams.length > 0) {
      const solanaTxFeeParamsEnum =
        SolanaTxFeeParamsMethod[
          solanaTxFeeParams
        ];
      if (solanaTxFeeParamsEnum == SolanaTxFeeParamsMethod.AUTO) {
        params['txFeeParams'] = {
          solana: SolanaTxFeeParamsMethod.AUTO,
        };
      } else {
        params['txFeeParams'] = {
          solana: {
            [solanaTxFeeParamsEnum]: solanaTxFeeValue,
          },
        };
      }
    }
    try {
      return await this.sdkService.send(params);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for initiating the transfer of tokens from one chain to another.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/bridge')
  @Tags('Transfers', 'Raw Transactions')
  @Example<EssentialWeb3Transaction>(
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
    /**
     * Solana's transaction <a href="https://solana.com/docs/core/fees" target="_blank"> prioritization fee</a> parameters<br/>
     * <b><u>AUTO</u></b> - Priority Fee will be calculated based on <a href="https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getRecentPrioritizationFees" target="_blank">solana/web3.js:Connection.getRecentPrioritizationFees</a><br/>
     * <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> - Add Priority Fee as price per unit in micro-lamports<br/>
     * <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> - Total Priority Fee impact will be as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeParams')
    solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    /**
     * Solana's transaction prioritization fee parameter value<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>AUTO</u></b> then value is ignored<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> then string value represent Priority Fee as price per unit in micro-lamports<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> then string value represent Total Priority Fee as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
    /**
     * The spender contract address for the approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: Allbridge Contract</b><br/>
     * If specified, the approval will be made for the specified contract address.<br/>
     */
    @Query('contractAddress') contractAddress?: string,
    /**
     * Output format of the Sui transaction payload.<br/>
     * <i><u>Optional. This parameter is relevant **only for Sui transactions**.</u></i><br/>
     */
    @Query('outputFormat') outputFormat: 'json' | 'base64' | 'hex' = 'json',
  ): Promise<RawTransaction> {
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    if (contractAddress !== undefined) {
      sourceTokenObj.bridgeAddress = contractAddress;
    }
    const destinationTokenObj =
      await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException(
        'Destination token not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (sourceTokenObj.chainSymbol == destinationTokenObj.chainSymbol) {
      throw new HttpException(
        'Invalid endpoint: for single-chain swaps, please use /raw/swap.',
        HttpStatus.BAD_REQUEST
      );
    }
    if (!Object.keys(Messenger).includes(messenger)) {
      throw new HttpException('Invalid messenger', HttpStatus.BAD_REQUEST);
    }
    const messengerEnum = Messenger[messenger];

    if (!Object.keys(FeePaymentMethod).includes(feePaymentMethod)) {
      throw new HttpException(
        'Invalid feePaymentMethod',
        HttpStatus.BAD_REQUEST,
      );
    }
    const feePaymentMethodEnum =
      FeePaymentMethod[feePaymentMethod];
    if (
      !!solanaTxFeeParams &&
      !Object.keys(SolanaTxFeeParamsMethod).includes(solanaTxFeeParams)
    ) {
      throw new HttpException(
        'Invalid solanaTxFeeParams',
        HttpStatus.BAD_REQUEST,
      );
    }
    const params = {
      amount: convertGt0IntAmountToFloat(amount, sourceTokenObj.decimals),
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
    };
    if (!!solanaTxFeeParams && solanaTxFeeParams.length > 0) {
      const solanaTxFeeParamsEnum =
        SolanaTxFeeParamsMethod[
          solanaTxFeeParams
        ];
      if (solanaTxFeeParamsEnum == SolanaTxFeeParamsMethod.AUTO) {
        params['txFeeParams'] = {
          solana: SolanaTxFeeParamsMethod.AUTO,
        };
      } else {
        params['txFeeParams'] = {
          solana: {
            [solanaTxFeeParamsEnum]: solanaTxFeeValue,
          },
        };
      }
    }
    try {
      return await this.sdkService.send(params);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Simulate and check if restore is needed for a Stellar transaction.
   *
   * @param xdrTx - The XDR transaction string.
   * @param sender - The sender's address.
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
      httpException(e);
    }
  }

  /**
   * Gets the average time in milliseconds to complete a transfer for the given tokens and messenger.
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
    const messengerEnum = Messenger[messenger];
    try {
      return this.sdkService.getTransferTime(
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
      );
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Fetches information about a token transfer using the chain symbol and transaction ID.
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
    const chainEnum = ChainSymbol[chain];
    try {
      return await this.sdkService.getTransferStatus(chainEnum, txId);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Retrieves the balance of a specified token for an account.
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
      httpException(e);
    }
  }

  /**
   * Retrieves the native (gas) token balance for a specified account on a given chain.
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
    const chainSymbol = ChainSymbol[chain];
    try {
      return await this.sdkService.getNativeTokenBalance({
        account: address,
        chainSymbol: chainSymbol,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
  * Retrieves token details by chain and address.
  */
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
    const chainSymbol = ChainSymbol[chain];
    try {
      return await this.sdkService.getTokenByChainAndAddress(
        chainSymbol,
        address,
      );
    } catch (e) {
      httpException(e);
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
    const messengerEnum = Messenger[messenger];
    try {
      return await this.sdkService.getGasFeeOptions(
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
      );
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Retrieves the gas balance for a specified account on a given chain.
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
    const chainSymbol = ChainSymbol[chain];
    try {
      return await this.sdkService.getGasBalance(chainSymbol, address);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Retrieves the maximum limit of extra gas amount.
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
      httpException(e);
    }
  }

  /**
   * Returns information about pending transactions for the same destination chain <br/>
   * and the amount of tokens that can be received as a result of transfer considering pending transactions.
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
      httpException(e);
    }
  }

  /**
   * Shows swap amount changes (fee and amount adjustments) during sending via pools.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/swap/details')
  @Tags('Transfers')
  async swapDetails(
    /**
     * Amount to be sent: Integer value according to the source token precision
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
      httpException(e);
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
     * Amount to be sent: Integer value according to the source token precision
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
      httpException(e);
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
    const messengerEnum = Messenger[messenger];
    const feeFloat = relayerFeeInStables
      ? convertIntAmountToFloat(
          relayerFeeInStables,
          sourceTokenObj.decimals,
        ).toFixed()
      : undefined;
    try {
      return await this.sdkService.getAmountToBeReceived(
        convertGt0IntAmountToFloat(amount, sourceTokenObj.decimals),
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
        refreshingPools ?? false,
        feeFloat,
      );
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Calculates the amount of tokens to send based on the requested amount to be received.
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
    const messengerEnum = Messenger[messenger];
    const feeFloat = relayerFeeInStables
      ? convertIntAmountToFloat(
          relayerFeeInStables,
          sourceTokenObj.decimals,
        ).toFixed()
      : undefined;
    try {
      return await this.sdkService.getAmountToSend(
        convertGt0IntAmountToFloat(amount, destinationTokenObj.decimals),
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
        refreshingPools ?? false,
        feeFloat,
      );
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Retrieves the amount of tokens approved for the bridge.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/bridge/allowance')
  @Tags('Transfers', 'Tokens')
  async getBridgeAllowance(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
    /**
     * The spender contract address for the approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: Allbridge Contract</b><br/>
     * If specified, the approval will be made for the specified contract address.<br/>
     */
    @Query('contractAddress') contractAddress?: string,
  ): Promise<string> {
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    if (contractAddress !== undefined) {
      tokenAddressObj.bridgeAddress = contractAddress;
    }
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
    try {
      return await this.sdkService.getBridgeAllowance({
        owner: ownerAddress,
        token: tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Checks if the approved token amount is sufficient for a transfer or pool operation.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/allowance')
  @Tags('Transfers', 'Tokens', 'Pool', 'Yield')
  async checkAllowance(
    /**
     * Amount: Integer value according to the token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * Selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
    /**
     * The type of approval to check.<br/>
     * Allowed values: `bridge`, `pool`<br/>
     * <b>Default: `bridge`</b>
     */
    @Query('type') type: 'bridge' | 'pool' | 'yield' = 'bridge',
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
    /**
     * The spender contract address for the approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: Allbridge Contract</b><br/>
     * If specified, the approval will be made for the specified contract address.<br/>
     */
    @Query('contractAddress') contractAddress?: string,
  ): Promise<boolean> {
    const tokenAddressObj = await this.sdkService.getTokenByAddressAndType(tokenAddress, type);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    if (contractAddress !== undefined) {
      tokenAddressObj.bridgeAddress = contractAddress;
    }
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;

    try {
      const params = {
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        owner: ownerAddress,
        token: tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      };

      if (type === 'yield') {
        return await this.sdkService.checkYieldAllowance({
          owner: ownerAddress,
          token: tokenAddressObj as TokenWithChainDetailsYield,
          amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        });
      }

      return type === 'pool'
        ? await this.sdkService.checkPoolAllowance(params)
        : await this.sdkService.checkBridgeAllowance(params);
    } catch (e) {
      httpException(e);
    }
  }


  /**
   * Checks if the approved token amount is sufficient for a bridge transfer.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/bridge/allowance')
  @Tags('Transfers', 'Tokens')
  async checkBridgeAllowance(
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
    /**
     * The spender contract address for the approval.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>Default: Allbridge Contract</b><br/>
     * If specified, the approval will be made for the specified contract address.<br/>
     */
    @Query('contractAddress') contractAddress?: string,
  ): Promise<boolean> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    if (contractAddress !== undefined) {
      tokenAddressObj.bridgeAddress = contractAddress;
    }
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
    try {
      return await this.sdkService.checkBridgeAllowance({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        owner: ownerAddress,
        token: tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for depositing tokens into a liquidity pool.
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
    /**
     * Solana's transaction <a href="https://solana.com/docs/core/fees" target="_blank"> prioritization fee</a> parameters<br/>
     * <b><u>AUTO</u></b> - Priority Fee will be calculated based on <a href="https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getRecentPrioritizationFees" target="_blank">solana/web3.js:Connection.getRecentPrioritizationFees</a><br/>
     * <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> - Add Priority Fee as price per unit in micro-lamports<br/>
     * <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> - Total Priority Fee impact will be as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeParams')
    solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    /**
     * Solana's transaction prioritization fee parameter value<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>AUTO</u></b> then value is ignored<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> then string value represent Priority Fee as price per unit in micro-lamports<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> then string value represent Total Priority Fee as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    if (
      !!solanaTxFeeParams &&
      !Object.keys(SolanaTxFeeParamsMethod).includes(solanaTxFeeParams)
    ) {
      throw new HttpException(
        'Invalid solanaTxFeeParams',
        HttpStatus.BAD_REQUEST,
      );
    }
    const params = {
      amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
      accountAddress: ownerAddress,
      token: tokenAddressObj,
    };
    if (!!solanaTxFeeParams && solanaTxFeeParams.length > 0) {
      const solanaTxFeeParamsEnum =
        SolanaTxFeeParamsMethod[
          solanaTxFeeParams
        ];
      if (solanaTxFeeParamsEnum == SolanaTxFeeParamsMethod.AUTO) {
        params['txFeeParams'] = {
          solana: SolanaTxFeeParamsMethod.AUTO,
        };
      } else {
        params['txFeeParams'] = {
          solana: {
            [solanaTxFeeParamsEnum]: solanaTxFeeValue,
          },
        };
      }
    }
    try {
      return await this.sdkService.deposit(params);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for withdrawing tokens from a liquidity pool.
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
    /**
     * Solana's transaction <a href="https://solana.com/docs/core/fees" target="_blank"> prioritization fee</a> parameters<br/>
     * <b><u>AUTO</u></b> - Priority Fee will be calculated based on <a href="https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getRecentPrioritizationFees" target="_blank">solana/web3.js:Connection.getRecentPrioritizationFees</a><br/>
     * <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> - Add Priority Fee as price per unit in micro-lamports<br/>
     * <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> - Total Priority Fee impact will be as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeParams')
    solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    /**
     * Solana's transaction prioritization fee parameter value<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>AUTO</u></b> then value is ignored<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> then string value represent Priority Fee as price per unit in micro-lamports<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> then string value represent Total Priority Fee as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    if (
      !!solanaTxFeeParams &&
      !Object.keys(SolanaTxFeeParamsMethod).includes(solanaTxFeeParams)
    ) {
      throw new HttpException(
        'Invalid solanaTxFeeParams',
        HttpStatus.BAD_REQUEST,
      );
    }
    const params = {
      amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
      accountAddress: ownerAddress,
      token: tokenAddressObj,
    };
    if (!!solanaTxFeeParams && solanaTxFeeParams.length > 0) {
      const solanaTxFeeParamsEnum =
        SolanaTxFeeParamsMethod[
          solanaTxFeeParams
        ];
      if (solanaTxFeeParamsEnum == SolanaTxFeeParamsMethod.AUTO) {
        params['txFeeParams'] = {
          solana: SolanaTxFeeParamsMethod.AUTO,
        };
      } else {
        params['txFeeParams'] = {
          solana: {
            [solanaTxFeeParamsEnum]: solanaTxFeeValue,
          },
        };
      }
    }
    try {
      return await this.sdkService.withdraw(params);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for claiming rewards from a liquidity pool.
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
    /**
     * Solana's transaction <a href="https://solana.com/docs/core/fees" target="_blank"> prioritization fee</a> parameters<br/>
     * <b><u>AUTO</u></b> - Priority Fee will be calculated based on <a href="https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getRecentPrioritizationFees" target="_blank">solana/web3.js:Connection.getRecentPrioritizationFees</a><br/>
     * <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> - Add Priority Fee as price per unit in micro-lamports<br/>
     * <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> - Total Priority Fee impact will be as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeParams')
    solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    /**
     * Solana's transaction prioritization fee parameter value<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>AUTO</u></b> then value is ignored<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>PRICE_PER_UNIT_IN_MICRO_LAMPORTS</u></b> then string value represent Priority Fee as price per unit in micro-lamports<br/>
     * If <i>solanaTxFeeParams</i> is <b><u>EXTRA_FEE_IN_LAMPORTS</u></b> then string value represent Total Priority Fee as extraFeeInLamports param<br/>
     */
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    if (
      !!solanaTxFeeParams &&
      !Object.keys(SolanaTxFeeParamsMethod).includes(solanaTxFeeParams)
    ) {
      throw new HttpException(
        'Invalid solanaTxFeeParams',
        HttpStatus.BAD_REQUEST,
      );
    }
    const params = {
      accountAddress: ownerAddress,
      token: tokenAddressObj,
    };
    if (!!solanaTxFeeParams && solanaTxFeeParams.length > 0) {
      const solanaTxFeeParamsEnum =
        SolanaTxFeeParamsMethod[
          solanaTxFeeParams
        ];
      if (solanaTxFeeParamsEnum == SolanaTxFeeParamsMethod.AUTO) {
        params['txFeeParams'] = {
          solana: SolanaTxFeeParamsMethod.AUTO,
        };
      } else {
        params['txFeeParams'] = {
          solana: {
            [solanaTxFeeParamsEnum]: solanaTxFeeValue,
          },
        };
      }
    }
    try {
      return await this.sdkService.claimRewards(params);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Check if the amount of approved tokens is enough for liquidity deposit
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/pool/allowance')
  @Tags('Tokens', 'Pool')
  async checkPoolAllowance(
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
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
    try {
      return await this.sdkService.checkPoolAllowance({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        owner: ownerAddress,
        token: tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
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
      httpException(e);
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
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<PoolInfo> {
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getPoolInfoFromServer(tokenAddressObj);
    } catch (e) {
      httpException(e);
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
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<Required<PoolInfo>> {
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getPoolInfoFromBlockchain(tokenAddressObj);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Get amount of tokens approved for pool
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/pool/allowance')
  @Tags('Pool', 'Tokens')
  async getPoolAllowance(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
  ): Promise<string> {
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
    try {
      return await this.sdkService.getPoolAllowance({
        owner: ownerAddress,
        token: tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
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
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<UserBalanceInfoDTO> {
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Pool not found', HttpStatus.BAD_REQUEST);
    }
    try {
      const resp = await this.sdkService.getUserPoolInfo(
        ownerAddress,
        tokenAddressObj,
      );
      const poolInfo = await this.sdkService.getPoolInfoFromServer(tokenAddressObj);
      return {
        lpAmount: resp.lpAmount,
        rewardDebt: resp.earned(poolInfo, tokenAddressObj.decimals)
      };
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Calculates the amount of LP tokens that will be deposited.
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
        convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        tokenAddressObj,
      );
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Calculates the amount of tokens that will be withdrawn.
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
    try {
      return await this.sdkService.getAmountToBeWithdrawn(
        convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        ownerAddress,
        tokenAddressObj,
      );
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Returns a list of supported CYD tokens.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/tokens')
  @Tags('Tokens', 'Yield')
  async getYieldTokens(): Promise<TokenWithChainDetails[]> {
    try {
      return this.sdkService.getCYDTokens();
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Get amount of tokens approved for yield
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/allowance')
  @Tags('Yield', 'Tokens')
  async getYieldAllowance(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<string> {
    const tokenAddressObj = await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Yield not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getYieldAllowance({
        owner: ownerAddress,
        token: tokenAddressObj,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Checks if the amount of approved tokens is enough for yield
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/yield/allowance')
  @Tags('Tokens', 'Yield')
  async checkYieldAllowance(
    /**
     * Amount: Integer value according to the token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<boolean> {
    const tokenAddressObj =
      await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Yield not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.checkYieldAllowance({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        owner: ownerAddress,
        token: tokenAddressObj,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Retrieves the balance of a specified yield token for an account.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/balance')
  @Tags('Tokens', 'Yield')
  async getYieldTokenBalance(
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<{ result: string }> {
    const tokenObj = await this.sdkService.getCYDTokenByYieldAddress(token);
    if (!tokenObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return {
        result: await this.sdkService.getCYDTokenBalance({
          owner: address,
          token: tokenObj,
        }),
      };
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Calculates the amount of CYD tokens that will be deposited.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/deposit/calculate')
  @Tags('Yield')
  async getYieldAmountToBeDeposited(
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
      await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getYieldEstimatedAmountOnDeposit({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        token: tokenAddressObj,
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Calculates the amounts of tokens ({@link YieldWithdrawAmount}) will be withdrawn
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/withdrawn/calculate')
  @Tags('Yield')
  async getYieldAmountToBeWithdrawn(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * Yield address on the source chain.
     */
    @Query('yieldAddress') yieldAddress: string,
  ): Promise<YieldWithdrawAmount[]> {
    const CYDToken =
      await this.sdkService.getCYDTokenByYieldAddress(yieldAddress);
    if (!CYDToken) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.getYieldWithdrawAmounts({
        amount: convertGt0IntAmountToFloat(amount, CYDToken.decimals),
        owner: ownerAddress,
        cydToken: CYDToken,
        });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for approving tokens usage by the Yield
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/yield/approve')
  @Tags('Yield', 'Raw Transactions')
  async approveYield(
    @Query('ownerAddress') ownerAddress: string,
    /**
     * Selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
    /**
     * The integer amount of tokens to approve.<br/>
     * <i><u>Optional.</u></i><br/>
     * <b>The maximum amount by default.</b>
     */
    @Query('amount') amount?: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj = await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.sdkService.yieldApprove({
        token: tokenAddressObj as TokenWithChainDetailsYield,
        owner: ownerAddress,
        amount: amount
      });
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for depositing tokens to Yield
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/yield/deposit')
  @Tags('Yield', 'Raw Transactions')
  async depositYield(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    /**
     * Min Virtual Amount: The Minimum float amount of CYD tokens.
     */
    @Query('minVirtualAmount') minVirtualAmount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected token on the source chain.
     */
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<RawTransaction> {
    const tokenAddressObj =
      await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    const params = {
      amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
      owner: ownerAddress,
      token: tokenAddressObj,
      minVirtualAmount: minVirtualAmount,
    };
    try {
      return await this.sdkService.yieldDeposit(params);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Creates a Raw Transaction for withdrawing tokens from Yield
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/yield/withdraw')
  @Tags('Yield', 'Raw Transactions')
  async withdrawYield(
    /**
     * Amount: Integer value according to the source token precision
     */
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    /**
     * selected yield address on the source chain.
     */
    @Query('yieldAddress') yieldAddress: string
  ): Promise<RawTransaction> {
    const cydToken =
      await this.sdkService.getCYDTokenByYieldAddress(yieldAddress);
    if (!cydToken) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    const params = {
      amount: convertGt0IntAmountToFloat(amount, cydToken.decimals),
      owner: ownerAddress,
      token: cydToken,
    };
    try {
      return await this.sdkService.yieldWithdraw(params);
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Rewrites a Solana v0 transaction so that `sponsor` becomes the fee payer.
   * Optionally prepends a SystemProgram.transfer(sponsor -> originalSigner) for `fundLamports`.
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/solana/replace-fee-payer')
  @Tags('Utils', 'Solana', 'Raw Transactions')
  async sponsorWrapRawTx(
    /**
     * Base58 public key of the sponsor who will pay fees (new fee payer).
     */
    @Query('sponsor') sponsor: string,

    /**
     * Original serialized Solana transaction in hex.
     */
    @Query('tx') tx: string,

    /**
     * Optional lamports to fund the original signer before executing the original instructions.
     * Integer in lamports.
     */
    @Query('fundLamports') fundLamports?: number,
  ): Promise<RawTransaction> {
    try {
      return await this.sdkService.sponsorWrapRawTx(
        sponsor,
        tx,
        fundLamports,
      );
    } catch (e) {
      httpException(e);
    }
  }

  /**
   * Convert SUI raw transaction to base64
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/sui/raw2base64')
  @Tags('Utils', 'SUI', 'Raw Transactions')
  async suiRaw2Base64(
    /**
     * Raw transaction that should be converted to base64.
     */
    @Query('rawTx') rawTx: string
  ): Promise<RawTransaction> {
    return this.sdkService.suiRaw2Base64(rawTx);
  }

  /**
   * Convert Tron raw transaction to hex
   */
  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/tron/raw2hex')
  @Tags('Utils', 'Tron', 'Raw Transactions')
  async tronRaw2Hex(
    /**
     * Raw transaction that should be converted to hex.
     */
    @Query('rawTx') rawTx: string
  ): Promise<RawTransaction> {
    return this.sdkService.tronRaw2Hex(rawTx);
  }
}

/**
 * Utility function that converts an integer amount (as a string) to a floating-point string,
 * ensuring the amount is greater than zero. Throws an HTTP exception if the conversion fails
 * or the amount is zero or less.
 *
 * @param amount - The integer amount as a string.
 * @param decimals - The number of decimals for the token.
 * @param exceptionMsg - Optional message to include in the error (default: 'Invalid amount').
 * @returns The converted floating-point amount as a string.
 */
export function convertGt0IntAmountToFloat(
  amount: string,
  decimals: number,
  exceptionMsg: string = 'Invalid amount',
): string {
  let amountFloatBig: Big;
  try {
    amountFloatBig = convertIntAmountToFloat(amount, decimals);
  } catch (ignoreError) {
    throw new HttpException(exceptionMsg, HttpStatus.BAD_REQUEST);
  }
  if (amountFloatBig.lte(0)) {
    throw new HttpException(exceptionMsg, HttpStatus.BAD_REQUEST);
  }
  return amountFloatBig.toFixed();
}