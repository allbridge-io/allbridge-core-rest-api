import { Module } from '@nestjs/common';
import { PoolController } from './controller/pool.controller';
import { SwaggerController } from './controller/swagger.controller';
import { TokensController } from './controller/tokens.controller';
import { TransfersController } from './controller/transfers.controller';
import { UtilsController } from './controller/utils.controller';
import { YieldController } from './controller/yield.controller';
import { BridgeQuoteService } from './service/bridge-quote.service';
import { ConfigService } from './service/config.service';
import { SDKService } from './service/sdk.service';

@Module({
  imports: [],
  controllers: [
    TokensController,
    TransfersController,
    PoolController,
    YieldController,
    UtilsController,
    SwaggerController,
  ],
  providers: [ConfigService, SDKService, BridgeQuoteService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
