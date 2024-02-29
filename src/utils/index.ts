import Big from 'big.js';
export function floatToInt(amount: string, decimals: number): string {
  return Big(amount).times(pow10(decimals)).toFixed();
}

export function intToFloat(amount: string, decimals: number): string {
  return Big(amount).div(pow10(decimals)).toFixed();
}

export function pow10(decimals: number): Big {
  return Big(10).pow(decimals);
}