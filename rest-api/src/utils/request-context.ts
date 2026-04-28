import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingHttpHeaders } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { getOriginalClientIp } from './request-ip';

interface RequestContextStore {
  headers: IncomingHttpHeaders;
  clientIp?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function requestContextMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  requestContextStorage.run({
    headers: request.headers,
    clientIp: getOriginalClientIp(request),
  }, () => next());
}

export function getRequestHeaders(): IncomingHttpHeaders | undefined {
  return requestContextStorage.getStore()?.headers;
}

export function getRequestClientIp(): string | undefined {
  return requestContextStorage.getStore()?.clientIp;
}
