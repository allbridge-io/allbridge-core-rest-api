import { RawSuiTransaction, RawTransaction } from '@allbridge/bridge-core-sdk';
import { SuiClient } from '@mysten/sui/client';
import { Transaction as SuiTransaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/bcs';

export async function raw2base64(rawTx: RawTransaction | string, nodeUrl: string): Promise<string> {
  const suiClient = new SuiClient({
    url: nodeUrl,
  });
  if (typeof rawTx === 'string') {
    rawTx = JSON.parse(rawTx) as RawTransaction;
  }
  const tx = SuiTransaction.from(rawTx as RawSuiTransaction);
  const bytes = await tx.build({ client: suiClient });
  return toBase64(bytes);
}