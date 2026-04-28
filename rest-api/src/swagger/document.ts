import { readFile } from 'fs/promises';
import { join } from 'path';

type OpenApiDocument = {
  openapi?: string;
  info?: Record<string, unknown>;
  paths?: Record<string, unknown>;
  tags?: Array<{ name: string; description?: string }>;
};

const TAG_ORDER = [
  'Tokens',
  'Transfers',
  'Pool',
  'Yield',
  'Utils',
  'Raw Transactions',
  'Solana',
  'Stellar',
  'Soroban',
  'SUI',
  'Tron',
] as const;

const PATH_ORDER = [
  '/chains',
  '/tokens',
  '/token/balance',
  '/token/native/balance',
  '/token/details',
  '/gas/fee',
  '/gas/balance',
  '/gas/extra/limits',
  '/check/stellar/balanceline',
  '/check/algorand/optin',
  '/raw/approve',
  '/raw/bridge/approve',
  '/raw/swap',
  '/raw/bridge',
  '/raw/stellar/restore',
  '/raw/stellar/trustline',
  '/raw/algorand/optin',
  '/transfer/time',
  '/transfer/status',
  '/pending/info',
  '/swap/details',
  '/bridge/details',
  '/bridge/receive/calculate',
  '/bridge/send/calculate',
  '/bridge/allowance',
  '/check/allowance',
  '/check/bridge/allowance',
  '/bridge/quote',
  '/raw/pool/approve',
  '/raw/deposit',
  '/raw/withdraw',
  '/raw/claim',
  '/check/pool/allowance',
  '/pool/info/server',
  '/pool/info/blockchain',
  '/pool/allowance',
  '/liquidity/details',
  '/liquidity/deposit/calculate',
  '/liquidity/withdrawn/calculate',
  '/liquidity/vusd/calculate',
  '/liquidity/amount-from-vusd/calculate',
  '/liquidity/apr/format',
  '/yield/tokens',
  '/yield/allowance',
  '/check/yield/allowance',
  '/yield/balance',
  '/yield/deposit/calculate',
  '/yield/withdrawn/calculate',
  '/raw/yield/approve',
  '/raw/yield/deposit',
  '/raw/yield/withdraw',
  '/utils/solana/add-memo',
  '/utils/solana/replace-fee-payer',
  '/utils/stellar/submit',
  '/utils/soroban/send',
  '/utils/soroban/confirm',
  '/utils/sui/build-send-from-custom-tx',
  '/utils/sui/raw2base64',
  '/utils/tron/raw2hex',
] as const;

function sortSwaggerPaths(paths: Record<string, unknown>): Record<string, unknown> {
  const pathOrderMap = new Map<string, number>(
    PATH_ORDER.map((path, index) => [path, index]),
  );

  return Object.fromEntries(
    Object.entries(paths).sort(([leftPath], [rightPath]) => {
      const leftOrder = pathOrderMap.get(leftPath) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = pathOrderMap.get(rightPath) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return leftPath.localeCompare(rightPath);
    }),
  );
}

export function normalizeSwaggerDocument(document: OpenApiDocument): OpenApiDocument {
  const normalizedDocument = { ...document };

  if (normalizedDocument.paths) {
    normalizedDocument.paths = sortSwaggerPaths(normalizedDocument.paths);
  }

  normalizedDocument.tags = TAG_ORDER.map((name) => ({ name }));

  return normalizedDocument;
}

export async function readSwaggerDocument(): Promise<OpenApiDocument> {
  const document = JSON.parse(
    (await readFile(join(process.cwd(), 'public', 'swagger.json'))).toString(
      'utf-8',
    ),
  ) as OpenApiDocument;

  return normalizeSwaggerDocument(document);
}
