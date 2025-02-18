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
    // Claim rewards using the correct endpoint
    const claimRewardsUrl = `${restApiUrl}/raw/claim?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting claim rewards transaction from: ${claimRewardsUrl}`);
    const { data: rawClaimTx } = await axios.get(claimRewardsUrl);

    // Sign and send transaction
    const txReceipt = await sendRawTransaction(rawClaimTx);
    console.log("Claim Rewards Transaction Hash:", txReceipt.transactionHash);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
