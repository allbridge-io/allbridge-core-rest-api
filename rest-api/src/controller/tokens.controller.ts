import {
  AmountFormatted,
  ChainDetailsMap,
  ChainSymbol,
  CYDToken,
  ExtraGasMaxLimitResponse,
  GasBalanceResponse,
  GasFeeOptions,
  Messenger,
  TokenWithChainDetails,
} from '@allbridge/bridge-core-sdk';
import { Controller, Get, HttpException, HttpExceptionBody, HttpStatus, Query } from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { Example, Response, Route, Tags } from 'tsoa';
import { httpException } from '../error/errors';
import { SDKService } from '../service/sdk.service';
import {
  AMOUNT_FORMATTED_EXAMPLE,
  EXTRA_GAS_MAX_LIMITS_EXAMPLE,
  GAS_BALANCE_EXAMPLE,
  GAS_FEE_OPTIONS_EXAMPLE,
  STELLAR_BALANCE_LINE_EXAMPLE,
  TOKEN_EXAMPLE,
} from '../swagger/examples';
import { resolveRuntimeChainSymbol } from '../utils/runtime-chain';
import { ensureEnumKey, requireQueryParam } from '../utils/validation';

@Controller()
@Route()
export class TokensController {
  constructor(private readonly sdkService: SDKService) {}

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/chains')
  @Tags('Tokens')
  async chainDetailsMap(
    @Query('type') type?: 'swap' | 'pool',
  ): Promise<ChainDetailsMap> {
    try {
      return this.sdkService.chainDetailsMap(type);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/tokens')
  @Tags('Tokens')
  @Example<Record<string, unknown>[]>([TOKEN_EXAMPLE], 'Supported tokens')
  @Example<Record<string, unknown>[]>([TOKEN_EXAMPLE], 'Supported tokens filtered by chain')
  async getTokens(
    @Query('type') type?: 'swap' | 'pool' | 'yield',
    @Query('chain') chain?: keyof typeof ChainSymbol,
  ): Promise<CYDToken[] | TokenWithChainDetails[]> {
    try {
      const chainSymbol = chain ? ChainSymbol[chain] : undefined;
      if (chain) {
        ensureEnumKey(ChainSymbol, chain, 'chain');
      }
      if (type === 'yield') {
        const yieldTokens = await this.sdkService.getCYDTokens();
        if (!chainSymbol) {
          return yieldTokens;
        }
        return yieldTokens.filter((token) => token.chainSymbol === chainSymbol);
      }
      if (chainSymbol) {
        return this.sdkService.getTokensByChain(chainSymbol, type);
      }
      return this.sdkService.getTokens(type);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/token/balance')
  @Tags('Tokens')
  @Example<{ result: string }>({ result: '1000000' }, 'Token balance in smallest units')
  async getTokenBalance(
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<{ result: string }> {
    address = requireQueryParam(address, 'address');
    token = requireQueryParam(token, 'token');
    try {
      const tokenObj = await this.sdkService.getAnyTokenByAddress(token);
      if (!tokenObj) {
        throw new HttpException('Token not found', HttpStatus.BAD_REQUEST);
      }
      if ('yieldAddress' in tokenObj && 'tokens' in tokenObj) {
        return {
          result: await this.sdkService.getCYDTokenBalance({
            owner: address,
            token: tokenObj,
          }),
        };
      }
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

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/token/native/balance')
  @Tags('Tokens')
  @Example<AmountFormatted>(AMOUNT_FORMATTED_EXAMPLE, 'Native balance response')
  async getTokenNativeBalance(
    @Query('address') address: string,
    @Query('chain') chain: string,
  ): Promise<AmountFormatted> {
    address = requireQueryParam(address, 'address');
    chain = requireQueryParam(chain, 'chain');
    const chainSymbol = resolveRuntimeChainSymbol(chain);
    try {
      return await this.sdkService.getNativeTokenBalance({
        account: address,
        chainSymbol: chainSymbol as ChainSymbol,
      });
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/token/details')
  @Tags('Tokens')
  async getTokenByChainAndAddress(
    @Query('address') address: string,
    @Query('chain') chain?: keyof typeof ChainSymbol,
  ): Promise<CYDToken | TokenWithChainDetails | undefined> {
    address = requireQueryParam(address, 'address');
    try {
      if (!chain) {
        return await this.sdkService.getAnyTokenByAddress(address);
      }
      ensureEnumKey(ChainSymbol, chain, 'chain');
      return await this.sdkService.getAnyTokenByChainAndAddress(ChainSymbol[chain], address);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/gas/fee')
  @Tags('Tokens')
  @Example<GasFeeOptions>(GAS_FEE_OPTIONS_EXAMPLE, 'Gas fee options')
  async getGasFeeOptions(
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger: keyof typeof Messenger,
  ): Promise<GasFeeOptions> {
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    messenger = requireQueryParam(messenger, 'messenger') as keyof typeof Messenger;
    ensureEnumKey(Messenger, messenger, 'messenger');
    const messengerEnum = Messenger[messenger];
    try {
      const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
      if (!sourceTokenObj) {
        throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
      }
      const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
      if (!destinationTokenObj) {
        throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getGasFeeOptions(
        sourceTokenObj,
        destinationTokenObj,
        messengerEnum,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/gas/balance')
  @Tags('Tokens')
  @Example<{ gasBalance: string | null; status: string }>(GAS_BALANCE_EXAMPLE, 'Gas balance response')
  async getGasBalance(
    @Query('address') address: string,
    @Query('chain') chain: keyof typeof ChainSymbol,
  ): Promise<GasBalanceResponse> {
    address = requireQueryParam(address, 'address');
    chain = requireQueryParam(chain, 'chain') as keyof typeof ChainSymbol;
    ensureEnumKey(ChainSymbol, chain, 'chain');
    const chainSymbol = ChainSymbol[chain];
    try {
      return await this.sdkService.getGasBalance(chainSymbol, address);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/gas/extra/limits')
  @Tags('Tokens')
  @Example<ExtraGasMaxLimitResponse>(EXTRA_GAS_MAX_LIMITS_EXAMPLE, 'Extra gas limit response')
  @Example<ExtraGasMaxLimitResponse>(EXTRA_GAS_MAX_LIMITS_EXAMPLE, 'Extra gas limit response for a specific messenger')
  async getExtraGasMaxLimits(
    @Query('sourceToken') sourceToken: string,
    @Query('destinationToken') destinationToken: string,
    @Query('messenger') messenger?: keyof typeof Messenger,
  ): Promise<ExtraGasMaxLimitResponse> {
    sourceToken = requireQueryParam(sourceToken, 'sourceToken');
    destinationToken = requireQueryParam(destinationToken, 'destinationToken');
    if (messenger) {
      ensureEnumKey(Messenger, messenger, 'messenger');
    }
    try {
      const sourceTokenObj = await this.sdkService.getTokenByAddress(sourceToken, 'swap');
      if (!sourceTokenObj) {
        throw new HttpException('Source token not found', HttpStatus.BAD_REQUEST);
      }
      const destinationTokenObj = await this.sdkService.getTokenByAddress(destinationToken, 'swap');
      if (!destinationTokenObj) {
        throw new HttpException('Destination token not found', HttpStatus.BAD_REQUEST);
      }
      return await this.sdkService.getExtraGasMaxLimits(
        sourceTokenObj,
        destinationTokenObj,
        messenger ? Messenger[messenger] : undefined,
      );
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/stellar/balanceline')
  @Tags('Tokens', 'Transfers')
  @Example<{
    balance: string;
    limit: string;
    asset_type: 'credit_alphanum4' | 'credit_alphanum12';
    asset_code: string;
    asset_issuer: string;
    buying_liabilities: string;
    selling_liabilities: string;
    last_modified_ledger: number;
    is_authorized: boolean;
    is_authorized_to_maintain_liabilities: boolean;
    is_clawback_enabled: boolean;
  }>(STELLAR_BALANCE_LINE_EXAMPLE, 'Existing Stellar balance line')
  async checkBalanceLine(
    @Query('address') address: string,
    @Query('token') token: string,
  ): Promise<Horizon.HorizonApi.BalanceLineAsset> {
    address = requireQueryParam(address, 'address');
    token = requireQueryParam(token, 'token');
    try {
      return await this.sdkService.checkBalanceLine(address, token);
    } catch (e) {
      httpException(e);
    }
  }

  @Response<HttpExceptionBody>(400, 'Bad request')
  @Get('/check/algorand/optin')
  @Tags('Tokens', 'Transfers')
  @Example<boolean>(true, 'Algorand opt-in check result')
  async checkAlgorandAssetOptIn(
    @Query('sender') sender: string,
    @Query('id') id: string,
    @Query('type') type: 'asset' | 'app' = 'asset',
  ): Promise<boolean> {
    sender = requireQueryParam(sender, 'sender');
    id = requireQueryParam(id, 'id');
    try {
      if (type === 'asset') {
        return await this.sdkService.checkAssetOptIn(sender, id);
      }
      if (type === 'app') {
        return await this.sdkService.checkAppOptIn(sender, id);
      }
    } catch (e) {
      httpException(e);
    }
    throw new HttpException('Unsupported type', HttpStatus.BAD_REQUEST);
  }
}
