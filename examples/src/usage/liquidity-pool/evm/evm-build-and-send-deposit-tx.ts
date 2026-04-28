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
    const depositAmount = "1";

    const depositUrl = `${restApiUrl}/raw/deposit?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${depositAmount}`;
    console.log(`Requesting deposit transaction from: ${depositUrl}`);
    const { data: rawDepositTx } = await axios.get(depositUrl);

    const txReceipt = await sendRawTransaction(signer, rawDepositTx);
    console.log("Deposit Transaction Hash:", txReceipt.hash);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
