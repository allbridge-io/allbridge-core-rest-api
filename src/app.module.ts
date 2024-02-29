import { Module } from '@nestjs/common';
import { SDKService } from './service/sdk.service';
import { RestController } from './controller/rest.controller';
import { ConfigService } from './service/config.service';

@Module({
  imports: [],
  controllers: [RestController],
  providers: [ConfigService, SDKService],
})
export class AppModule {}
