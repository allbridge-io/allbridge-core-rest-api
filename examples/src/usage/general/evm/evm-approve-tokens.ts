import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import Web3, { Transaction } from 'web3';

dotenv.config({ path: '.env' });

const NODE_RPC_URL = getEnvVar('WEB3_PROVIDER_URL');
const privateKey = getEnvVar('ETH_PRIVATE_KEY');
const accountAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('ETH_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const web3 = new Web3(NODE_RPC_URL);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

const sendRawTransaction = async (txData: Transaction) => {
  const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
  return await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
};

const main = async () => {
  try {
    // Check allowance
    const allowanceResponse = await axios.get(
      `${restApiUrl}/bridge/allowance?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`
    );
    const isApproved = allowanceResponse.data;
    console.log("Check Allowance: ", isApproved);

    if (!isApproved) {
      const approvalUrl = `${restApiUrl}/raw/approve?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
      const { data: rawApprovalTx } = await axios.get(approvalUrl);
      const approveReceipt = await sendRawTransaction(rawApprovalTx);
      console.log("Approval Transaction Hash: ", approveReceipt.transactionHash);
    } else {
      console.log("Token is already approved.");
    }
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
