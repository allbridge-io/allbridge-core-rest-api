import Big from 'big.js';

export function toBaseUnits(amount: string | number, decimals: number): string {
  return new Big(amount)
    .mul(new Big(10).pow(decimals))
    .round(0, Big.roundDown)
    .toString();
}

export function fromBaseUnits(amount: string | number, decimals: number): string {
  return new Big(amount)
    .div(new Big(10).pow(decimals))
    .toString();
}
