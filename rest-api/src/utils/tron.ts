import { RawTransaction } from '@allbridge/bridge-core-sdk';
import { TronWeb } from 'tronweb';

export async function raw2hex(rawTx: string | RawTransaction, nodeUrl: string): Promise<string> {
  const tronWeb = new TronWeb({
    fullNode: nodeUrl,
    solidityNode: nodeUrl
  });
  if (typeof rawTx === 'string') {
    rawTx = JSON.parse(rawTx) as RawTransaction;
  }
  const bytes = tronWeb.utils.transaction.txJsonToPb(rawTx).serializeBinary();
  return Promise.resolve(tronWeb.utils.bytes.byteArray2hexStr(bytes).toLowerCase());
}