import { Controller, Get, HttpExceptionBody, Query } from '@nestjs/common';
import { Horizon, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { Example, Response, Route, Tags } from 'tsoa';
import { httpException } from '../error/errors';
import { SDKService } from '../service/sdk.service';
import {
  SOLANA_RAW_TX_HEX_EXAMPLE,
  SUI_RAW_TX_JSON_EXAMPLE,
} from '../swagger/examples';
import { RawTransaction } from '../types/raw-transaction';
import { requireQueryParam } from '../utils/validation';

@Controller()
@Route()
export class UtilsController {
  constructor(private readonly sdkService: SDKService) {}

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/solana/add-memo')
  @Tags('Utils', 'Solana', 'Raw Transactions')
  @Example<string>(SOLANA_RAW_TX_HEX_EXAMPLE, 'Solana raw transaction with memo')
  async solanaAddMemo(
    @Query('tx') tx: string,
    @Query('memo') memo: string,
  ): Promise<RawTransaction> {
    tx = requireQueryParam(tx, 'tx');
    memo = requireQueryParam(memo, 'memo');
    try {
      return await this.sdkService.solanaAddMemo(tx, memo);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/solana/replace-fee-payer')
  @Tags('Utils', 'Solana', 'Raw Transactions')
  @Example<string>(SOLANA_RAW_TX_HEX_EXAMPLE, 'Solana raw transaction with replaced fee payer')
  async sponsorWrapRawTx(
    @Query('sponsor') sponsor: string,
    @Query('tx') tx: string,
    @Query('fundLamports') fundLamports?: number,
  ): Promise<RawTransaction> {
    sponsor = requireQueryParam(sponsor, 'sponsor');
    tx = requireQueryParam(tx, 'tx');
    try {
      return await this.sdkService.sponsorWrapRawTx(sponsor, tx, fundLamports);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/stellar/submit')
  @Tags('Utils', 'Stellar')
  @Example<{ hash: string }>({ hash: 'stellar-tx-hash' }, 'Submit response')
  async submitTransactionStellar(
    @Query('xdrTx') xdrTx: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    xdrTx = requireQueryParam(xdrTx, 'xdrTx');
    try {
      return await this.sdkService.submitTransactionStellar(xdrTx);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/soroban/send')
  @Tags('Utils', 'Soroban')
  @Example<{ hash: string; status: string }>({ hash: 'soroban-tx-hash', status: 'PENDING' }, 'Send response')
  async sendTransactionSoroban(
    @Query('xdrTx') xdrTx: string,
  ): Promise<SorobanRpc.Api.SendTransactionResponse> {
    xdrTx = requireQueryParam(xdrTx, 'xdrTx');
    try {
      return await this.sdkService.sendTransactionSoroban(xdrTx);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/soroban/confirm')
  @Tags('Utils', 'Soroban')
  @Example<{ status: string }>({ status: 'SUCCESS' }, 'Confirmation response')
  async confirmSorobanTx(
    @Query('hash') hash: string,
    @Query('secondsToWait') secondsToWait?: number,
  ): Promise<SorobanRpc.Api.GetTransactionResponse> {
    hash = requireQueryParam(hash, 'hash');
    try {
      return await this.sdkService.confirmSorobanTx(hash, secondsToWait);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/sui/build-send-from-custom-tx')
  @Tags('Utils', 'SUI', 'Raw Transactions')
  @Example<string>(SUI_RAW_TX_JSON_EXAMPLE, 'Raw Sui bridge transaction built from custom tx')
  async suiBuildSendTxFromCustomTx(
    @Query('baseTx') baseTx: string,
    @Query('inputCoin') inputCoin: string,
    @Query('params') params: string,
  ): Promise<RawTransaction> {
    baseTx = requireQueryParam(baseTx, 'baseTx');
    inputCoin = requireQueryParam(inputCoin, 'inputCoin');
    params = requireQueryParam(params, 'params');
    try {
      return await this.sdkService.suiBuildSendTxFromCustomTx(baseTx, inputCoin, params);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/sui/raw2base64')
  @Tags('Utils', 'SUI', 'Raw Transactions')
  @Example<string>('AAECAw==', 'Base64 encoded Sui transaction')
  async suiRaw2Base64(
    @Query('rawTx') rawTx: string,
  ): Promise<RawTransaction> {
    rawTx = requireQueryParam(rawTx, 'rawTx');
    try {
      return await this.sdkService.suiRaw2Base64(rawTx);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/utils/tron/raw2hex')
  @Tags('Utils', 'Tron', 'Raw Transactions')
  @Example<string>('0a0b0c0d', 'Hex encoded Tron transaction')
  async tronRaw2Hex(
    @Query('rawTx') rawTx: string,
  ): Promise<RawTransaction> {
    rawTx = requireQueryParam(rawTx, 'rawTx');
    try {
      return await this.sdkService.tronRaw2Hex(rawTx);
    } catch (e) {
      httpException(e);
    }
  }
}
