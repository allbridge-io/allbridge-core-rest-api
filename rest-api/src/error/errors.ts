/*eslint @typescript-eslint/no-useless-constructor: "off"*/

import { SdkRootError } from '@allbridge/bridge-core-sdk';
import { HttpException, HttpStatus } from '@nestjs/common';

export abstract class RestSDKError extends Error {
  protected constructor(message?: string) {
    super(message);
  }
}

export class ConfigError extends RestSDKError {
  constructor(message?: string) {
    super(message);
  }
}

export const httpException = (e) => {
  if (e instanceof SdkRootError) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: e.errorCode,
        message: e.message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
};
