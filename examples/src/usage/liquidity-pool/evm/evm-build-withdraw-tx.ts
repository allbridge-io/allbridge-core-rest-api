import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import Web3, { Transaction } from 'web3';

dotenv.config({ path: '.env' });

const ETH_NODE_RPC_URL = getEnvVar('WEB3_PROVIDER_URL');
const privateKey = getEnvVar('ETH_PRIVATE_KEY');
const accountAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('ETH_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const web3 = new Web3(ETH_NODE_RPC_URL);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

const sendRawTransaction = async (txData: Transaction) => {
  const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
  return await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
};

const main = async () => {
  try {
    const withdrawAmount = "0.5"; // Amount to withdraw

    // Request raw withdraw transaction
    const withdrawUrl = `${restApiUrl}/raw/withdraw?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${withdrawAmount}`;
    console.log(`Requesting withdraw transaction from: ${withdrawUrl}`);
    const { data: rawWithdrawTx } = await axios.get(withdrawUrl);

    // Sign and send transaction
    const txReceipt = await sendRawTransaction(rawWithdrawTx);
    console.log("Withdraw Transaction Hash:", txReceipt.transactionHash);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
