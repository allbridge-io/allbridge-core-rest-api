import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import {
  createSigner,
  sendRawTransaction,
} from '../../../utils/ethers';

dotenv.config({ path: '.env' });

const ETH_NODE_RPC_URL = getEnvVar('WEB3_PROVIDER_URL');
const privateKey = getEnvVar('ETH_PRIVATE_KEY');
const accountAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('ETH_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const signer = createSigner(ETH_NODE_RPC_URL, privateKey);

const main = async () => {
  try {
    const withdrawAmount = "0.5";

    const withdrawUrl = `${restApiUrl}/raw/withdraw?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${withdrawAmount}`;
    console.log(`Requesting withdraw transaction from: ${withdrawUrl}`);
    const { data: rawWithdrawTx } = await axios.get(withdrawUrl);

    const txReceipt = await sendRawTransaction(signer, rawWithdrawTx);
    console.log("Withdraw Transaction Hash:", txReceipt.hash);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
