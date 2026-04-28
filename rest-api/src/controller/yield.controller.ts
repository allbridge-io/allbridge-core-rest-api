import {
  TokenWithChainDetails,
  YieldWithdrawAmount,
} from '@allbridge/bridge-core-sdk';
import { Controller, Get, HttpException, HttpExceptionBody, HttpStatus, Query } from '@nestjs/common';
import { Example, Response, Route, Tags } from 'tsoa';
import { httpException } from '../error/errors';
import { SDKService } from '../service/sdk.service';
import {
  YIELD_TOKEN_EXAMPLE,
  YIELD_WITHDRAW_AMOUNT_EXAMPLE,
} from '../swagger/examples';
import { RawTransaction } from '../types/raw-transaction';
import { convertGt0IntAmountToFloat } from '../utils/calculation';
import { requireQueryParam } from '../utils/validation';

@Controller()
@Route()
export class YieldController {
  constructor(private readonly sdkService: SDKService) {}

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/tokens')
  @Tags('Tokens', 'Yield')
  @Example<Record<string, unknown>[]>([YIELD_TOKEN_EXAMPLE], 'Available yield tokens')
  async getYieldTokens(): Promise<TokenWithChainDetails[]> {
    try {
      return this.sdkService.getCYDTokens();
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/allowance')
  @Tags('Yield', 'Tokens')
  @Example<string>('100000000', 'Yield allowance amount')
  async getYieldAllowance(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<string> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
      if (!tokenAddressObj) {
        throw new HttpException('Yield not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getYieldAllowance({
        owner: ownerAddress,
        token: tokenAddressObj,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/yield/allowance')
  @Tags('Tokens', 'Yield')
  @Example<boolean>(true, 'Yield allowance check result')
  async checkYieldAllowance(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<boolean> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
      if (!tokenAddressObj) {
        throw new HttpException('Yield not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.checkYieldAllowance({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        owner: ownerAddress,
        token: tokenAddressObj,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/balance')
  @Tags('Tokens', 'Yield')
  @Example<{ result: string }>({ result: '2500000' }, 'Yield token balance in smallest units')
  async getYieldTokenBalance(
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<{ result: string }> {
    address = requireQueryParam(address, 'address');
    token = requireQueryParam(token, 'token');
    try {
      const tokenObj = await this.sdkService.getCYDTokenByYieldAddress(token);
      if (!tokenObj) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }
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

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/deposit/calculate')
  @Tags('Yield')
  @Example<string>('2.4987', 'Estimated CYD amount on deposit')
  async getYieldAmountToBeDeposited(
    @Query('amount') amount: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<string> {
    amount = requireQueryParam(amount, 'amount');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
      if (!tokenAddressObj) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getYieldEstimatedAmountOnDeposit({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        token: tokenAddressObj,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/yield/withdrawn/calculate')
  @Tags('Yield')
  @Example<Record<string, unknown>[]>(YIELD_WITHDRAW_AMOUNT_EXAMPLE, 'Estimated withdrawn token amounts')
  async getYieldAmountToBeWithdrawn(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('yieldAddress') yieldAddress: string,
  ): Promise<YieldWithdrawAmount[]> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    yieldAddress = requireQueryParam(yieldAddress, 'yieldAddress');
    try {
      const cydToken = await this.sdkService.getCYDTokenByYieldAddress(yieldAddress);
      if (!cydToken) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getYieldWithdrawAmounts({
        amount: convertGt0IntAmountToFloat(amount, cydToken.decimals),
        owner: ownerAddress,
        cydToken,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/yield/approve')
  @Tags('Yield', 'Raw Transactions')
  @Example<string>('0xffff', 'Yield approve raw transaction')
  async approveYield(
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
    @Query('amount') amount?: string,
  ): Promise<RawTransaction> {
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
      if (!tokenAddressObj) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.yieldApprove({
        token: tokenAddressObj,
        owner: ownerAddress,
        amount,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/yield/deposit')
  @Tags('Yield', 'Raw Transactions')
  @Example<string>('0xffff', 'Yield deposit raw transaction')
  async depositYield(
    @Query('amount') amount: string,
    @Query('minVirtualAmount') minVirtualAmount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('tokenAddress') tokenAddress: string,
  ): Promise<RawTransaction> {
    amount = requireQueryParam(amount, 'amount');
    minVirtualAmount = requireQueryParam(minVirtualAmount, 'minVirtualAmount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    tokenAddress = requireQueryParam(tokenAddress, 'tokenAddress');
    try {
      const tokenAddressObj = await this.sdkService.getTokenWithYieldByAddress(tokenAddress);
      if (!tokenAddressObj) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.yieldDeposit({
        amount: convertGt0IntAmountToFloat(amount, tokenAddressObj.decimals),
        owner: ownerAddress,
        token: tokenAddressObj,
        minVirtualAmount,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/raw/yield/withdraw')
  @Tags('Yield', 'Raw Transactions')
  @Example<string>('0xffff', 'Yield withdraw raw transaction')
  async withdrawYield(
    @Query('amount') amount: string,
    @Query('ownerAddress') ownerAddress: string,
    @Query('yieldAddress') yieldAddress: string,
  ): Promise<RawTransaction> {
    amount = requireQueryParam(amount, 'amount');
    ownerAddress = requireQueryParam(ownerAddress, 'ownerAddress');
    yieldAddress = requireQueryParam(yieldAddress, 'yieldAddress');
    try {
      const cydToken = await this.sdkService.getCYDTokenByYieldAddress(yieldAddress);
      if (!cydToken) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.yieldWithdraw({
        amount: convertGt0IntAmountToFloat(amount, cydToken.decimals),
        owner: ownerAddress,
        token: cydToken,
      });
    } catch (e) {
      httpException(e);
    }
  }
}
