/*eslint @typescript-eslint/no-useless-constructor: "off"*/

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
