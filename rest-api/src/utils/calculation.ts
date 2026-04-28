import { HttpException, HttpStatus } from '@nestjs/common';
import { Big, BigSource } from 'big.js';

export function convertIntAmountToFloat(
  amountInt: BigSource,
  decimals: number,
): Big {
  const amountValue = Big(amountInt);
  if (amountValue.eq(0)) {
    return Big(0);
  }
  return Big(amountValue).div(toPowBase10(decimals));
}

export function toPowBase10(decimals: number): Big {
  return Big(10).pow(decimals);
}


export function convertGt0IntAmountToFloat(
  amount: string,
  decimals: number,
  exceptionMsg: string = 'Invalid amount',
): string {
  let amountFloatBig: Big;
  try {
    amountFloatBig = convertIntAmountToFloat(amount, decimals);
  } catch (ignoreError) {
    throw new HttpException(exceptionMsg, HttpStatus.BAD_REQUEST);
  }
  if (amountFloatBig.lte(0)) {
    throw new HttpException(exceptionMsg, HttpStatus.BAD_REQUEST);
  }
  return amountFloatBig.toFixed();
}