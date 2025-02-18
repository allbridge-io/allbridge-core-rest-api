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
    // Request estimated amount of LP tokens to be received
    const depositCalcUrl = `${restApiUrl}/liquidity/deposit/calculate?amount=1&tokenAddress=${tokenAddress}`;
    console.log(`Requesting deposit calculation from: ${depositCalcUrl}`);
    const { data: estimatedAmount } = await axios.get(depositCalcUrl);

    console.log("If you send 1, then", estimatedAmount, "of LP tokens will be deposited");
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
