import type { IncomingHttpHeaders } from 'node:http';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value)
    ? value.join(', ')
    : value;
}

export function normalizeRequestHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const normalizedHeaders: Record<string, string> = {};

  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(headerName)) {
      continue;
    }

    const normalizedValue = normalizeHeaderValue(headerValue);
    if (!normalizedValue) {
      continue;
    }

    normalizedHeaders[headerName] = normalizedValue;
  }

  return normalizedHeaders;
}
