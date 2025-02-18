import Web3 from 'web3';

export async function sendRawTransaction(
  web3: Web3,
  rawTransaction: any,
) {
  if (rawTransaction.from === undefined) {
    throw Error('rawTransaction.from is undefined');
  }
  const gasLimit = await web3.eth.estimateGas(rawTransaction);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const account: Account = web3.eth.accounts.wallet[rawTransaction.from];
  const signedTx = await account.signTransaction({
    ...rawTransaction,
    gas: gasLimit,
  });
  if (signedTx.rawTransaction === undefined) {
    throw Error('signedTx.rawTransaction is undefined');
  }
  console.log('Sending transaction', signedTx.transactionHash);
  return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}
