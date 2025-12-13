import { Module } from '@nestjs/common';
import { RestController } from './controller/rest.controller';
import { SwaggerController } from './controller/swagger.controller';
import { BridgeQuoteService } from './service/bridge-quote.service';
import { ConfigService } from './service/config.service';
import { SDKService } from './service/sdk.service';

@Module({
  imports: [],
  controllers: [RestController, SwaggerController],
  providers: [ConfigService, SDKService, BridgeQuoteService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
