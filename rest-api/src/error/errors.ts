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

const GENERIC_BAD_REQUEST_MESSAGE = 'Bad request';

export const httpException = (e) => {
  if (e instanceof HttpException) {
    throw e;
  }
  if (e instanceof SdkRootError) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: e.errorCode,
        message: GENERIC_BAD_REQUEST_MESSAGE,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  throw new HttpException(GENERIC_BAD_REQUEST_MESSAGE, HttpStatus.BAD_REQUEST);
};
