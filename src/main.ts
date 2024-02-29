import { contextMiddleware, LoggingInterceptor } from '@allbridge/logger';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import safeStringify from 'fast-safe-stringify';
//import bodyParser from 'body-parser';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { AppModule } from './app.module';
import { ConfigService } from './service/config.service';
import { getLogger } from './utils/logger-factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // read the JSON file to string and parse the string to object literal
  const document = JSON.parse(
    (await readFile(join(process.cwd(), 'public', 'swagger.json'))).toString(
      'utf-8',
    ),
  );
  SwaggerModule.setup('api', app, document);

  app.use(contextMiddleware);
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
