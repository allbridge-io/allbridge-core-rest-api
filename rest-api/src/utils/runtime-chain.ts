import { ChainSymbol } from '@allbridge/bridge-core-sdk';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '../service/config.service';

function getRuntimeChainKeys(): Set<string> {
  return new Set([
    ...Object.keys(ChainSymbol),
    ...ConfigService.getNetworks(),
  ]);
}

export function ensureRuntimeChainKey(
  value: string,
  label: string,
): void {
  if (!getRuntimeChainKeys().has(value)) {
    throw new HttpException(`Invalid ${label}`, HttpStatus.BAD_REQUEST);
  }
}

export function resolveRuntimeChainSymbol(
  value: string,
): string {
  if (Object.keys(ChainSymbol).includes(value)) {
    return ChainSymbol[value as keyof typeof ChainSymbol];
  }

  ensureRuntimeChainKey(value, 'chain');
  return value;
}
