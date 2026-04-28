import {
  AmountFormat,
  ChainSymbol,
  EssentialWeb3Transaction,
  FeePaymentMethod,
  Messenger,
  PendingStatusInfoResponse,
  RawAlgTransaction,
  SendParams,
  SwapParams,
  TokenWithChainDetails,
  TokenWithChainDetailsYield,
  TransferStatusResponse,
} from '@allbridge/bridge-core-sdk';
import { Controller, Get, HttpException, HttpExceptionBody, HttpStatus, Query } from '@nestjs/common';
import { Example, Response, Route, Tags } from 'tsoa';
import { httpException } from '../error/errors';
import { BridgeQuoteResponse, BridgeQuoteService } from '../service/bridge-quote.service';
import { BridgeAmounts, SDKService, SolanaTxFeeParamsMethod, SwapCalcInfo } from '../service/sdk.service';
import {
  ALGORAND_RAW_OPT_IN_EXAMPLE,
  BRIDGE_AMOUNTS_EXAMPLE,
  BRIDGE_QUOTE_EXAMPLE,
  PENDING_STATUS_INFO_EXAMPLE,
  RAW_BRIDGE_EVM_EXAMPLE,
  RAW_BRIDGE_SOLANA_EXAMPLE,
  RAW_BRIDGE_STELLAR_EXAMPLE,
  RAW_BRIDGE_STX_EXAMPLE,
  RAW_BRIDGE_TRON_EXAMPLE,
  SOLANA_RAW_TX_HEX_EXAMPLE,
  STELLAR_RESTORE_XDR_EXAMPLE,
  STELLAR_TRUSTLINE_XDR_EXAMPLE,
  SUI_RAW_TX_JSON_EXAMPLE,
  SWAP_CALC_INFO_EXAMPLE,
  TRANSFER_STATUS_EXAMPLE,
} from '../swagger/examples';
import {
  RawTransaction,
  RawTronTransactionResponse,
} from '../types/raw-transaction';
import { convertGt0IntAmountToFloat, convertIntAmountToFloat } from '../utils/calculation';
import { buildBridgeSolanaTxFeeParams } from '../utils/solana-tx-fee-params';
import { resolveRuntimeChainSymbol } from '../utils/runtime-chain';
import { withBridgeAddressOverride } from '../utils/token';
import {
  ensureEnumKey,
  requireQueryParam,
  validateOptionalEnumKey,
} from '../utils/validation';

@Controller()
@Route()
export class TransfersController {
  constructor(
    private readonly sdkService: SDKService,
    private readonly quoteService: BridgeQuoteService,
  ) {}

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/approve')
  @Tags('Pool', 'Transfers', 'Raw Transactions', 'Yield')
  @Example<EssentialWeb3Transaction>(RAW_BRIDGE_EVM_EXAMPLE, 'EVM approve transaction')
  @Example<RawTronTransactionResponse>(RAW_BRIDGE_TRON_EXAMPLE, 'Tron approve transaction')
  async approve(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('amount') amount?: string,
    @Query('type') type: 'bridge' | 'pool' | 'yield' = 'bridge',
    @Query('messenger') messenger?: keyof typeof Messenger,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
    @Query('contractAddress') contractAddress?: string,
  ): Promise<RawTransaction> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    const tokenAddressObj = await this.sdkService.getTokenByAddressAndType(tokenAddress, type);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    validateOptionalEnumKey(Messenger, messenger, 'messenger');
    validateOptionalEnumKey(
      FeePaymentMethod,
      feePaymentMethod,
      'feePaymentMethod',
    );

    try {
      if (type === 'yield') {
        return await this.sdkService.yieldApprove({
          token: tokenAddressObj as TokenWithChainDetailsYield,
          owner: ownerAddress,
          amount,
        });
      }
      if (type === 'pool') {
        return await this.sdkService.poolApprove({
          token: tokenAddressObj,
          owner: ownerAddress,
          amount,
        });
      }
      const messengerEnum = Messenger[messenger] || undefined;
      const feePaymentMethodEnum = feePaymentMethod
        ? FeePaymentMethod[feePaymentMethod]
        : undefined;
      return await this.sdkService.bridgeApprove({
        token: withBridgeAddressOverride(
          tokenAddressObj as TokenWithChainDetails,
          contractAddress,
        ),
        owner: ownerAddress,
        amount,
        messenger: messengerEnum,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/bridge/approve')
  @Tags('Transfers', 'Raw Transactions')
  @Example<EssentialWeb3Transaction>(RAW_BRIDGE_EVM_EXAMPLE, 'EVM bridge approve transaction')
  @Example<RawTronTransactionResponse>(RAW_BRIDGE_TRON_EXAMPLE, 'Tron bridge approve transaction')
  async bridgeApprove(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('amount') amount?: string,
    @Query('messenger') messenger?: keyof typeof Messenger,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
    @Query('contractAddress') contractAddress?: string,
  ): Promise<RawTransaction> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'swap');
    if (!tokenAddressObj) {
      throw new HttpException('Bridge token not found', HttpStatus.BAD_REQUEST);
    }
    validateOptionalEnumKey(Messenger, messenger, 'messenger');
    validateOptionalEnumKey(
      FeePaymentMethod,
      feePaymentMethod,
      'feePaymentMethod',
    );
    const messengerEnum = Messenger[messenger] || undefined;
    const feePaymentMethodEnum = feePaymentMethod
      ? FeePaymentMethod[feePaymentMethod]
      : undefined;
    try {
      return await this.sdkService.bridgeApprove({
        token: withBridgeAddressOverride(tokenAddressObj, contractAddress),
        owner: ownerAddress,
        amount,
        messenger: messengerEnum,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/swap')
  @Tags('Transfers', 'Raw Transactions')
  @Example<EssentialWeb3Transaction>(RAW_BRIDGE_EVM_EXAMPLE, 'EVM swap transaction')
  @Example<string>(SOLANA_RAW_TX_HEX_EXAMPLE, 'Solana swap transaction in hex form')
  @Example<string>(SUI_RAW_TX_JSON_EXAMPLE, 'Sui swap transaction in json form')
  @Example<string>('AAECAw==', 'Sui swap transaction in base64 form')
  @Example<string>(RAW_BRIDGE_STX_EXAMPLE, 'Stacks swap transaction')
  @Example<string>('0a0b0c0d', 'Tron swap transaction in hex form')
  async getRawSwap(
    @Query('amount') amount: string,
    @Query('sender') sender: string,
    @Query('recipient') recipient: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('minimumReceiveAmount') minimumReceiveAmount?: string,
    @Query('solanaTxFeeParams') solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
    @Query('solanaPayTxFeeWithStablecoinSwap') solanaPayTxFeeWithStablecoinSwap?: boolean,
    @Query('contractAddress') contractAddress?: string,
    @Query('outputFormat') outputFormat: 'json' | 'base64' | 'hex' = 'json',
  ): Promise<RawTransaction> {
    amount = requireQueryParam(amount, 'amount');
    sender = requireQueryParam(sender, 'sender');
    recipient = requireQueryParam(recipient, 'recipient');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
    }
    if (sourceTokenObj.chainSymbol !== destinationTokenObj.chainSymbol) {
      throw new HttpException(
        'For cross-chain swaps, please use the /raw/bridge endpoint.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let minimumReceiveAmountFloat: string;
    try {
      minimumReceiveAmountFloat = convertIntAmountToFloat(
        minimumReceiveAmount,
        destinationTokenObj.decimals,
      ).toFixed();
    } catch {
      minimumReceiveAmountFloat = '0';
    }

    validateOptionalEnumKey(
      SolanaTxFeeParamsMethod,
      solanaTxFeeParams,
      'solanaTxFeeParams',
    );

    const params: SwapParams = {
      amount: convertGt0IntAmountToFloat(amount, sourceTokenObj.decimals),
      destinationToken: destinationTokenObj,
      fromAccountAddress: sender,
      minimumReceiveAmount: minimumReceiveAmount
        ? minimumReceiveAmountFloat
        : undefined,
      sourceToken: withBridgeAddressOverride(sourceTokenObj, contractAddress),
      toAccountAddress: recipient,
    };
    const txFeeParams = buildBridgeSolanaTxFeeParams(
      solanaTxFeeParams,
      solanaTxFeeValue,
      solanaPayTxFeeWithStablecoinSwap,
    );
    if (txFeeParams) {
      params.txFeeParams = txFeeParams;
    }

    try {
      return await this.sdkService.send(params, outputFormat);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/bridge')
  @Tags('Transfers', 'Raw Transactions')
  @Example<EssentialWeb3Transaction>(RAW_BRIDGE_EVM_EXAMPLE, 'EVM transaction')
  @Example<string>(RAW_BRIDGE_SOLANA_EXAMPLE, 'Solana transaction')
  @Example<string>(RAW_BRIDGE_STELLAR_EXAMPLE, 'Stellar transaction')
  @Example<string>(RAW_BRIDGE_STX_EXAMPLE, 'Stacks transaction')
  @Example<RawTronTransactionResponse>(RAW_BRIDGE_TRON_EXAMPLE, 'Tron transaction')
  async getRawSwapAndBridge(
    @Query('amount') amount: string,
    @Query('sender') sender: string,
    @Query('recipient') recipient: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
    @Query('feePaymentMethod') feePaymentMethod: keyof typeof FeePaymentMethod,
    @Query('fee') fee?: string,
    @Query('extraGas') extraGas?: string,
    @Query('solanaTxFeeParams') solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
    @Query('solanaPayTxFeeWithStablecoinSwap') solanaPayTxFeeWithStablecoinSwap?: boolean,
    @Query('contractAddress') contractAddress?: string,
    @Query('outputFormat') outputFormat: 'json' | 'base64' | 'hex' = 'json',
  ): Promise<RawTransaction> {
    amount = requireQueryParam(amount, 'amount');
    sender = requireQueryParam(sender, 'sender');
    recipient = requireQueryParam(recipient, 'recipient');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    messenger = requireQueryParam(messenger, 'messenger') as keyof typeof Messenger;
    feePaymentMethod = requireQueryParam(
      feePaymentMethod,
      'feePaymentMethod',
    ) as keyof typeof FeePaymentMethod;
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
    }
    if (sourceTokenObj.chainSymbol === destinationTokenObj.chainSymbol) {
      throw new HttpException(
        'Invalid endpoint: for single-chain swaps, please use /raw/swap.',
        HttpStatus.BAD_REQUEST,
      );
    }

    ensureEnumKey(Messenger, messenger, 'messenger');
    ensureEnumKey(FeePaymentMethod, feePaymentMethod, 'feePaymentMethod');
    validateOptionalEnumKey(
      SolanaTxFeeParamsMethod,
      solanaTxFeeParams,
      'solanaTxFeeParams',
    );

    const params: SendParams = {
      amount: convertGt0IntAmountToFloat(amount, sourceTokenObj.decimals),
      destinationToken: destinationTokenObj,
      fromAccountAddress: sender,
      sourceToken: withBridgeAddressOverride(sourceTokenObj, contractAddress),
      toAccountAddress: recipient,
      messenger: Messenger[messenger],
      fee,
      feeFormat: AmountFormat.INT,
      extraGas,
      extraGasFormat: AmountFormat.INT,
      gasFeePaymentMethod: FeePaymentMethod[feePaymentMethod],
    };
    const txFeeParams = buildBridgeSolanaTxFeeParams(
      solanaTxFeeParams,
      solanaTxFeeValue,
      solanaPayTxFeeWithStablecoinSwap,
    );
    if (txFeeParams) {
      params.txFeeParams = txFeeParams;
    }

    try {
      return await this.sdkService.send(params, outputFormat);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/stellar/restore/')
  @Tags('Transfers', 'Raw Transactions')
  @Example<string>(STELLAR_RESTORE_XDR_EXAMPLE, 'Restore XDR transaction')
  async simulateAndCheckRestoreTxRequiredSoroban(
    @Query('xdrTx') xdrTx: string,
    @Query('sender') sender: string,
  ): Promise<string> {
    xdrTx = requireQueryParam(xdrTx, 'xdrTx');
    sender = requireQueryParam(sender, 'sender');
    try {
      return await this.sdkService.simulateAndCheckRestoreTxRequiredSoroban(xdrTx, sender);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/stellar/trustline')
  @Tags('Transfers', 'Raw Transactions')
  @Example<string>(STELLAR_TRUSTLINE_XDR_EXAMPLE, 'Trustline XDR transaction')
  async buildChangeTrustLineXdrTx(
    @Query('sender') sender: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('limit') limit?: string,
  ): Promise<string> {
    sender = requireQueryParam(sender, 'sender');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      return await this.sdkService.buildChangeTrustLineXdrTx({
        sender,
        tokenAddress,
        limit,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/algorand/optin/')
  @Tags('Transfers', 'Raw Transactions')
  @Example<string[]>(ALGORAND_RAW_OPT_IN_EXAMPLE, 'Algorand raw opt-in transaction')
  async buildRawTransactionAssetOptIn(
    @Query('id') id: string,
    @Query('sender') sender: string,
    @Query('type') type: 'asset' | 'app' = 'asset',
  ): Promise<RawAlgTransaction> {
    id = requireQueryParam(id, 'id');
    sender = requireQueryParam(sender, 'sender');
    try {
      if (type === 'asset') {
        return await this.sdkService.buildRawTransactionAssetOptIn(id, sender);
      }
      if (type === 'app') {
        return await this.sdkService.buildRawTransactionAppOptIn(id, sender);
      }
    } catch (e) {
      httpException(e);
    }
    throw new HttpException('Unsupported type', HttpStatus.BAD_REQUEST);
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/transfer/time')
  @Tags('Transfers')
  @Example<number>(90000, 'Average transfer time in milliseconds')
  async getTransferTime(
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
  ): Promise<number | null> {
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    messenger = requireQueryParam(messenger, 'messenger') as keyof typeof Messenger;
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
    }
    ensureEnumKey(Messenger, messenger, 'messenger');
    try {
      return this.sdkService.getTransferTime(
        sourceTokenObj,
        destinationTokenObj,
        Messenger[messenger],
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/transfer/status')
  @Tags('Transfers')
  @Example<Record<string, unknown>>(TRANSFER_STATUS_EXAMPLE, 'Transfer status response')
  async getTransferStatus(
    @Query('chain') chain: string,
    @Query('txId') txId: string,
  ): Promise<TransferStatusResponse> {
    chain = requireQueryParam(chain, 'chain');
    txId = requireQueryParam(txId, 'txId');
    const chainSymbol = resolveRuntimeChainSymbol(chain);
    try {
      return await this.sdkService.getTransferStatus(chainSymbol as ChainSymbol, txId);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/pending/info')
  @Tags('Transfers')
  @Example<PendingStatusInfoResponse>(PENDING_STATUS_INFO_EXAMPLE, 'Pending transfer information')
  async getPendingStatusInfo(
    @Query('amount') amount: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
  ): Promise<PendingStatusInfoResponse> {
    amount = requireQueryParam(amount, 'amount');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
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

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/swap/details')
  @Tags('Transfers')
  @Example<SwapCalcInfo>(SWAP_CALC_INFO_EXAMPLE, 'Swap details response')
  async swapDetails(
    @Query('amount') amount: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
  ): Promise<SwapCalcInfo> {
    amount = requireQueryParam(amount, 'amount');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
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

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/bridge/details')
  @Tags('Transfers')
  @Example<SwapCalcInfo>(SWAP_CALC_INFO_EXAMPLE, 'Bridge details response')
  async bridgeDetails(
    @Query('amount') amount: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
  ): Promise<SwapCalcInfo> {
    amount = requireQueryParam(amount, 'amount');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
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

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/bridge/receive/calculate')
  @Tags('Transfers')
  @Example<BridgeAmounts>(BRIDGE_AMOUNTS_EXAMPLE, 'Amount to be received')
  async getAmountToBeReceived(
    @Query('amount') amount: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
    @Query('refreshingPools') refreshingPools?: boolean,
    @Query('relayerFeeInStables') relayerFeeInStables?: string,
  ): Promise<BridgeAmounts> {
    amount = requireQueryParam(amount, 'amount');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    messenger = requireQueryParam(messenger, 'messenger') as keyof typeof Messenger;
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
    }
    ensureEnumKey(Messenger, messenger, 'messenger');
    const feeFloat = relayerFeeInStables
      ? convertIntAmountToFloat(relayerFeeInStables, sourceTokenObj.decimals).toFixed()
      : undefined;
    try {
      return await this.sdkService.getAmountToBeReceived(
        convertGt0IntAmountToFloat(amount, sourceTokenObj.decimals),
        sourceTokenObj,
        destinationTokenObj,
        Messenger[messenger],
        refreshingPools ?? false,
        feeFloat,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/bridge/send/calculate')
  @Tags('Transfers')
  @Example<BridgeAmounts>(BRIDGE_AMOUNTS_EXAMPLE, 'Amount to send')
  async getAmountToSend(
    @Query('amount') amount: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
    @Query('refreshingPools') refreshingPools?: boolean,
    @Query('relayerFeeInStables') relayerFeeInStables?: string,
  ): Promise<BridgeAmounts> {
    amount = requireQueryParam(amount, 'amount');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    messenger = requireQueryParam(messenger, 'messenger') as keyof typeof Messenger;
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken);
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }
    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken);
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
    }
    ensureEnumKey(Messenger, messenger, 'messenger');
    const feeFloat = relayerFeeInStables
      ? convertIntAmountToFloat(relayerFeeInStables, sourceTokenObj.decimals).toFixed()
      : undefined;
    try {
      return await this.sdkService.getAmountToSend(
        convertGt0IntAmountToFloat(amount, destinationTokenObj.decimals),
        sourceTokenObj,
        destinationTokenObj,
        Messenger[messenger],
        refreshingPools ?? false,
        feeFloat,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/bridge/allowance')
  @Tags('Transfers', 'Tokens')
  @Example<string>('100000000', 'Allowance amount in token smallest units')
  async getBridgeAllowance(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
    @Query('contractAddress') contractAddress?: string,
  ): Promise<string> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'swap');
    if (!tokenAddressObj) {
      throw new HttpException('Bridge token not found', HttpStatus.BAD_REQUEST);
    }
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
    try {
      return await this.sdkService.getBridgeAllowance({
        owner: ownerAddress,
        token: withBridgeAddressOverride(tokenAddressObj, contractAddress),
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/allowance')
  @Tags('Transfers', 'Tokens', 'Pool', 'Yield')
  @Example<boolean>(true, 'Allowance check result')
  async checkAllowance(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('type') type: 'bridge' | 'pool' | 'yield' = 'bridge',
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
    @Query('contractAddress') contractAddress?: string,
  ): Promise<boolean> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    const tokenAddressObj = await this.sdkService.getTokenByAddressAndType(tokenAddress, type);
    if (!tokenAddressObj) {
      throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
    }
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;

    try {
      const amountFloat = convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals);
      if (type === 'yield') {
        return await this.sdkService.checkYieldAllowance({
          owner: ownerAddress,
          token: tokenAddressObj as TokenWithChainDetailsYield,
          amount: amountFloat,
        });
      }

      const params = {
        amount: amountFloat,
        owner: ownerAddress,
        token: type === 'bridge'
          ? withBridgeAddressOverride(tokenAddressObj as TokenWithChainDetails, contractAddress)
          : tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      };
      return type === 'pool'
        ? await this.sdkService.checkPoolAllowance(params)
        : await this.sdkService.checkBridgeAllowance(params);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/bridge/allowance')
  @Tags('Transfers', 'Tokens')
  @Example<boolean>(true, 'Bridge allowance check result')
  async checkBridgeAllowance(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
    @Query('contractAddress') contractAddress?: string,
  ): Promise<boolean> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'swap');
    if (!tokenAddressObj) {
      throw new HttpException('Bridge token not found', HttpStatus.BAD_REQUEST);
    }
    const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
    try {
      return await this.sdkService.checkBridgeAllowance({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        owner: ownerAddress,
        token: withBridgeAddressOverride(tokenAddressObj, contractAddress),
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/bridge/quote')
  @Tags('Transfers')
  @Example<BridgeQuoteResponse>(BRIDGE_QUOTE_EXAMPLE, 'Bridge quote with multiple messengers and fee payment methods')
  async bridgeQuote(
    @Query('amount') amountInt: string,
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
  ): Promise<BridgeQuoteResponse> {
    amountInt = requireQueryParam(amountInt, 'amount');
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
    if (!sourceTokenObj) {
      throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
    }

    const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
    if (!destinationTokenObj) {
      throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.quoteService.getQuote({
        amountInt,
        sourceToken: sourceTokenObj,
        destinationToken: destinationTokenObj,
      });
    } catch (e) {
      httpException(e);
    }
  }
}
