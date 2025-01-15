import { readFile } from 'fs/promises';
import { join } from 'path';

import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Hidden, Route } from 'tsoa';

@Controller('api')
@Route('api')
@Hidden()
export class SwaggerController {
  @Get('swagger.json')
  @ApiOperation({
    description: 'swagger static file',
  })
  async swagger(): Promise<any> {
    return JSON.parse(
      (await readFile(join(process.cwd(), 'public', 'swagger.json'))).toString(
        'utf-8',
      ),
    );
  }
}
