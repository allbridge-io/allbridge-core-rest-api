import type { Request } from 'express';

function extractIpFromForwardedHeader(
  forwardedFor: string | string[] | undefined,
): string | undefined {
  const forwardedValue = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;

  if (!forwardedValue) {
    return undefined;
  }

  const normalizedIp = forwardedValue.split(',')[0]?.trim();
  return normalizedIp || undefined;
}

export function normalizeForwardedClientIp(
  ip: string | undefined,
): string | undefined {
  if (!ip) {
    return undefined;
  }

  const normalizedIp = ip.split(',')[0]?.trim();
  return normalizedIp || undefined;
}

export function getOriginalClientIp(request: Request): string | undefined {
  return extractIpFromForwardedHeader(request.headers['x-forwarded-for'])
    || request.socket?.remoteAddress
    || request.ip
    || undefined;
}
