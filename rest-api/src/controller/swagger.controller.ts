import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { Hidden, Route } from 'tsoa';
import { readSwaggerDocument } from '../swagger/document';

@Controller('api')
@Route('api')
@Hidden()
export class SwaggerController {
  @Get('swagger.json')
  @ApiOperation({
    description: 'swagger static file',
  })
  async swagger(): Promise<unknown> {
    return readSwaggerDocument();
  }
}
