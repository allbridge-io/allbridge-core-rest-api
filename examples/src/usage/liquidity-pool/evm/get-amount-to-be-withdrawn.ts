import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import Web3 from 'web3';

dotenv.config({ path: '.env' });

const ETH_NODE_RPC_URL = getEnvVar("WEB3_PROVIDER_URL");
const privateKey = getEnvVar("ETH_PRIVATE_KEY");
const accountAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
const tokenAddress = getEnvVar("ETH_TOKEN_ADDRESS");
const restApiUrl = getEnvVar("REST_API_URL");

const web3 = new Web3(ETH_NODE_RPC_URL);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

const main = async () => {
  try {
    const withdrawAmount = "0.5"; // Amount to withdraw

    // Request estimated withdraw amount
    const estimateUrl = `${restApiUrl}/liquidity/withdrawn/calculate?amount=${withdrawAmount}&ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting estimated withdraw amount from: ${estimateUrl}`);
    const { data: estimatedAmount } = await axios.get(estimateUrl);

    console.log(`If you withdraw ${withdrawAmount} LP tokens, then ${estimatedAmount} will be received.`);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
