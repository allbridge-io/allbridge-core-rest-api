import { TronWeb } from 'tronweb';

type TronWebTransaction = Parameters<TronWeb['trx']['sign']>[0];

export async function sendTrxRawTransaction(
  tronWeb: TronWeb,
  rawTransaction: TronWebTransaction,
): Promise<any> {
  const signedTx = await tronWeb.trx.sign(rawTransaction as TronWebTransaction);
  if (typeof signedTx === 'string' || !('signature' in signedTx) || !signedTx.signature) {
    throw new Error('Transaction was not signed properly');
  }
  return tronWeb.trx.sendRawTransaction(signedTx);
}
