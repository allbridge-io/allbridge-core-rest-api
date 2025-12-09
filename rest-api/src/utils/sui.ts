import { RawSuiTransaction, RawTransaction } from '@allbridge/bridge-core-sdk';
import { toBase64 } from '@mysten/bcs';
import { SuiClient } from '@mysten/sui/client';
import { Transaction as SuiTransaction } from '@mysten/sui/transactions';

export async function raw2base64(rawTx: RawTransaction | string, nodeUrl: string): Promise<string> {
  const suiClient = new SuiClient({
    url: nodeUrl,
  });
  if (typeof rawTx === 'string') {
    rawTx = JSON.parse(rawTx) as RawTransaction;
  }
  const tx = SuiTransaction.from(rawTx as RawSuiTransaction);
  const bytes = await tx.build({ client: suiClient });
  return Promise.resolve(toBase64(bytes));
}