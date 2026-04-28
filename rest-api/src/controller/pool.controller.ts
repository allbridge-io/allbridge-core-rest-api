import {
  AmountFormat,
  AmountFormatted,
  FeePaymentMethod,
  LiquidityPoolsParams,
  LiquidityPoolsParamsWithAmount,
  PoolInfo,
} from '@allbridge/bridge-core-sdk';
import { Controller, Get, HttpException, HttpExceptionBody, HttpStatus, Query } from '@nestjs/common';
import { Example, Response, Route, Tags } from 'tsoa';
import { httpException } from '../error/errors';
import { SDKService, SolanaTxFeeParamsMethod } from '../service/sdk.service';
import {
  AMOUNT_FORMATTED_EXAMPLE,
  APR_PERCENT_EXAMPLE,
  POOL_INFO_EXAMPLE,
  RAW_BRIDGE_STX_EXAMPLE,
  USER_POOL_INFO_EXAMPLE,
} from '../swagger/examples';
import { UserLiquidityDetails } from '../types/liquidity';
import { RawTransaction } from '../types/raw-transaction';
import { convertGt0IntAmountToFloat } from '../utils/calculation';
import { buildPoolSolanaTxFeeParams } from '../utils/solana-tx-fee-params';
import { ensureEnumKey, requireQueryParam, validateOptionalEnumKey } from '../utils/validation';

@Controller()
@Route()
export class PoolController {
  constructor(private readonly sdkService: SDKService) {}

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/pool/approve')
  @Tags('Pool', 'Raw Transactions')
  @Example<string>('0xffff', 'Pool approve raw transaction')
  async poolApprove(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('amount') amount?: string,
  ): Promise<RawTransaction> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.poolApprove({
        token: tokenAddressObj,
        owner: ownerAddress,
        amount,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/deposit')
  @Tags('Pool', 'Raw Transactions')
  @Example<string>('0xffff', 'Pool deposit raw transaction')
  @Example<string>(RAW_BRIDGE_STX_EXAMPLE, 'Stacks pool deposit transaction')
  async deposit(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('solanaTxFeeParams') solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
  ): Promise<RawTransaction> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    validateOptionalEnumKey(
      SolanaTxFeeParamsMethod,
      solanaTxFeeParams,
      'solanaTxFeeParams',
    );
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }

      const params: LiquidityPoolsParamsWithAmount = {
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        accountAddress: ownerAddress,
        token: tokenAddressObj,
      };
      const txFeeParams = buildPoolSolanaTxFeeParams(
        solanaTxFeeParams,
        solanaTxFeeValue,
      );
      if (txFeeParams) {
        params.txFeeParams = txFeeParams;
      }
      return await this.sdkService.deposit(params);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/withdraw')
  @Tags('Pool', 'Raw Transactions')
  @Example<string>('0xffff', 'Pool withdraw raw transaction')
  @Example<string>(RAW_BRIDGE_STX_EXAMPLE, 'Stacks pool withdraw transaction')
  async withdraw(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('solanaTxFeeParams') solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
  ): Promise<RawTransaction> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    validateOptionalEnumKey(
      SolanaTxFeeParamsMethod,
      solanaTxFeeParams,
      'solanaTxFeeParams',
    );
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }

      const params: LiquidityPoolsParamsWithAmount = {
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        accountAddress: ownerAddress,
        token: tokenAddressObj,
      };
      const txFeeParams = buildPoolSolanaTxFeeParams(
        solanaTxFeeParams,
        solanaTxFeeValue,
      );
      if (txFeeParams) {
        params.txFeeParams = txFeeParams;
      }
      return await this.sdkService.withdraw(params);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/claim')
  @Tags('Pool', 'Raw Transactions')
  @Example<string>('0xffff', 'Pool claim rewards raw transaction')
  @Example<string>(RAW_BRIDGE_STX_EXAMPLE, 'Stacks pool claim rewards transaction')
  async claimRewards(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('solanaTxFeeParams') solanaTxFeeParams?: keyof typeof SolanaTxFeeParamsMethod,
    @Query('solanaTxFeeValue') solanaTxFeeValue?: string,
  ): Promise<RawTransaction> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    validateOptionalEnumKey(
      SolanaTxFeeParamsMethod,
      solanaTxFeeParams,
      'solanaTxFeeParams',
    );
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }

      const params: LiquidityPoolsParams = {
        accountAddress: ownerAddress,
        token: tokenAddressObj,
      };
      const txFeeParams = buildPoolSolanaTxFeeParams(
        solanaTxFeeParams,
        solanaTxFeeValue,
      );
      if (txFeeParams) {
        params.txFeeParams = txFeeParams;
      }
      return await this.sdkService.claimRewards(params);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/pool/allowance')
  @Tags('Tokens', 'Pool')
  @Example<boolean>(true, 'Pool allowance check result')
  async checkPoolAllowance(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
  ): Promise<boolean> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
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

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/pool/info/server')
  @Tags('Pool')
  @Example<PoolInfo>(POOL_INFO_EXAMPLE, 'Pool info from server')
  async getPoolInfoByServer(
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<PoolInfo> {
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getPoolInfoFromServer(tokenAddressObj);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/pool/info/blockchain')
  @Tags('Pool')
  @Example<Required<PoolInfo>>(POOL_INFO_EXAMPLE, 'Pool info from blockchain')
  async getPoolInfoFromBlockchain(
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<Required<PoolInfo>> {
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getPoolInfoFromBlockchain(tokenAddressObj);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/pool/allowance')
  @Tags('Pool', 'Tokens')
  @Example<string>('100000000', 'Pool allowance amount')
  async getPoolAllowance(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('feePaymentMethod') feePaymentMethod?: keyof typeof FeePaymentMethod,
  ): Promise<string> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      const feePaymentMethodEnum = FeePaymentMethod[feePaymentMethod] ?? FeePaymentMethod.WITH_NATIVE_CURRENCY;
      return await this.sdkService.getPoolAllowance({
        owner: ownerAddress,
        token: tokenAddressObj,
        gasFeePaymentMethod: feePaymentMethodEnum,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/liquidity/details')
  @Tags('Pool')
  @Example<UserLiquidityDetails>(USER_POOL_INFO_EXAMPLE, 'User liquidity position')
  async getUserPoolInfo(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<UserLiquidityDetails> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      const resp = await this.sdkService.getUserPoolInfo(ownerAddress, tokenAddressObj);
      const poolInfo = await this.sdkService.getPoolInfoFromServer(tokenAddressObj);
      return {
        lpAmount: resp.lpAmount,
        rewardDebt: resp.earned(poolInfo, tokenAddressObj.decimals),
      };
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/liquidity/deposit/calculate')
  @Tags('Pool')
  @Example<string>('12.345678', 'Estimated LP amount on deposit')
  async getAmountToBeDeposited(
    @Query('amount') amount: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<string> {
    amount = requireQueryParam(amount, 'amount');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getAmountToBeDeposited(
        convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        tokenAddressObj,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/liquidity/withdrawn/calculate')
  @Tags('Pool')
  @Example<string>('10.125', 'Estimated token amount on withdraw')
  async getAmountToBeWithdrawn(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<string> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getAmountToBeWithdrawn(
        convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        ownerAddress,
        tokenAddressObj,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/liquidity/vusd/calculate')
  @Tags('Pool')
  @Example<AmountFormatted>(AMOUNT_FORMATTED_EXAMPLE, 'vUsd amount for the provided token amount')
  async getVUsdFromAmount(
    @Query('amount') amount: string,
    @Query('amountFormat') amountFormat: keyof typeof AmountFormat,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<AmountFormatted> {
    amount = requireQueryParam(amount, 'amount');
    amountFormat = requireQueryParam(amountFormat, 'amountFormat') as keyof typeof AmountFormat;
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    ensureEnumKey(AmountFormat, amountFormat, 'amountFormat');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getVUsdFromAmount(
        amount,
        AmountFormat[amountFormat],
        tokenAddressObj,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/liquidity/amount-from-vusd/calculate')
  @Tags('Pool')
  @Example<AmountFormatted>(AMOUNT_FORMATTED_EXAMPLE, 'Token amount for the provided vUsd amount')
  async getAmountFromVUsd(
    @Query('vUsdAmount') vUsdAmount: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<AmountFormatted> {
    vUsdAmount = requireQueryParam(vUsdAmount, 'vUsdAmount');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenByAddress(tokenAddress, 'pool');
      if (!tokenAddressObj) {
        throw new HttpException('Pool token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getAmountFromVUsd(
        vUsdAmount,
        tokenAddressObj,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/liquidity/apr/format')
  @Tags('Pool')
  @Example<string>(APR_PERCENT_EXAMPLE, 'APR formatted as a percentage string')
  formatApr(
    @Query('apr') apr: string,
  ): string {
    apr = requireQueryParam(apr, 'apr');
    try {
      return this.sdkService.aprInPercents(apr);
    } catch (e) {
      httpException(e);
    }
  }
}
