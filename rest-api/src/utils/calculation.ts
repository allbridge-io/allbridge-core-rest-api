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
