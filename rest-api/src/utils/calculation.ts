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

/**
 * Utility function that converts an integer amount (as a string) to a floating-point string,
 * ensuring the amount is greater than zero. Throws an HTTP exception if the conversion fails
 * or the amount is zero or less.
 *
 * @param amount - The integer amount as a string.
 * @param decimals - The number of decimals for the token.
 * @param exceptionMsg - Optional message to include in the error (default: 'Invalid amount').
 * @returns The converted floating-point amount as a string.
 */
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