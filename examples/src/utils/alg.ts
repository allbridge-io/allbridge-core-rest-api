import { RawAlgTransaction } from '@allbridge/bridge-core-sdk';
import { getEnvVar } from "./env";
import algosdk, { Account, Algodv2, Transaction } from "algosdk";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";

export async function sendAlgRawTransaction(rawTransaction: RawAlgTransaction): Promise<string> {
  console.log('Sending Alg Raw Transaction');
  const nodeRpcUrl = getEnvVar('ALG_PROVIDER_URL');
  const privateKey = getEnvVar('ALG_PRIVATE_KEY');

  const mnemonic = algosdk.secretKeyToMnemonic(Buffer.from(privateKey, 'hex'));

  const signer = algosdk.mnemonicToSecretKey(mnemonic);
  console.log('Signer', signer.addr.toString());

  const algorand = AlgorandClient.fromConfig({
    algodConfig: { server: nodeRpcUrl },
  });
  const algod = algorand.client.algod;

  const txns: Transaction[] = rawTransaction.map((hex: any) => {
    const bytes = Buffer.from(hex, "hex");
    return algosdk.decodeUnsignedTransaction(bytes);
  });

  return simpleSend(txns, signer, algod);


}

async function simpleSend(txns: Transaction[], signer: Account, algod: Algodv2): Promise<string> {
  const alreadyGrouped = txns.every((t) => t.group && t.group.length > 0);
  if (!alreadyGrouped) {
    console.log("AssignGroupID...");
    algosdk.assignGroupID(txns);
  }
  const stxns = txns.map((t) => t.signTxn(signer.sk));

  const { txid } = await algod.sendRawTransaction(stxns).do();
  return txid;
}


