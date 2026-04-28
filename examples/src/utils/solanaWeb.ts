import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export async function sendSolanaRawTransaction(
  rawTxHex: string,
  privateKey: string,
  rpcUrl: string,
): Promise<string> {
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
  const txBuffer = Buffer.from(rawTxHex, 'hex');
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([keypair]);

  const connection = new Connection(rpcUrl, 'confirmed');
  return await connection.sendTransaction(transaction);
}
