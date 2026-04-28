import {
  JsonRpcProvider,
  TransactionReceipt,
  TransactionRequest,
  Wallet,
} from 'ethers';

type EvmRawTransaction = TransactionRequest & {
  gas?: TransactionRequest['gasLimit'];
};

export function createSigner(rpcUrl: string, privateKey: string) {
  return new Wallet(privateKey, new JsonRpcProvider(rpcUrl));
}

export async function sendRawTransaction(
  signer: Wallet,
  rawTransaction: EvmRawTransaction,
): Promise<TransactionReceipt> {
  const { gas, gasLimit, ...transactionWithoutGas } = rawTransaction;
  const txRequest: TransactionRequest = {
    ...transactionWithoutGas,
    from: rawTransaction.from ?? signer.address,
    gasLimit: gasLimit ?? gas,
  };

  if (txRequest.gasLimit === undefined) {
    txRequest.gasLimit = await signer.estimateGas(txRequest);
  }

  const txResponse = await signer.sendTransaction(txRequest);
  console.log('Sending transaction', txResponse.hash);
  const txReceipt = await txResponse.wait();
  if (txReceipt === null) {
    throw Error('txReceipt is null');
  }
  return txReceipt;
}
