import { contextMiddleware, LoggingInterceptor } from '@allbridge/logger';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import safeStringify from 'fast-safe-stringify';
import { AppModule } from './app.module';
import { readSwaggerDocument } from './swagger/document';
import { ConfigService } from './service/config.service';
import { getLogger } from './utils/logger-factory';
import { requestContextMiddleware } from './utils/request-context';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  const document = await readSwaggerDocument();
  SwaggerModule.setup('api', app, document as Parameters<typeof SwaggerModule.setup>[2]);

  app.use(contextMiddleware);
  app.use(requestContextMiddleware);
  app.useGlobalInterceptors(new LoggingInterceptor(getLogger('http')));
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  await app.listen(ConfigService.getPort());
}

bootstrap()
  .then(() => {
    console.log('Rest API is started');
  })
  .catch((e) => {
    console.log(e);
    console.error('Rest API got some error', e.message, safeStringify(e));
  });
