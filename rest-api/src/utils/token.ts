import { TokenWithChainDetails } from '@allbridge/bridge-core-sdk';

export function withBridgeAddressOverride<T extends TokenWithChainDetails>(
  token: T,
  bridgeAddress?: string,
): T {
  if (bridgeAddress === undefined) {
    return token;
  }

  return {
    ...token,
    bridgeAddress,
  };
}
