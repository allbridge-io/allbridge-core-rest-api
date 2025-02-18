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
    // Request user balance info from the liquidity pool
    const balanceUrl = `${restApiUrl}/liquidity/details?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting user balance info from: ${balanceUrl}`);
    const { data: userBalanceInfo } = await axios.get(balanceUrl);

    // Request pool info from blockchain
    const poolInfoUrl = `${restApiUrl}/pool/info/blockchain?tokenAddress=${tokenAddress}`;
    console.log(`Requesting pool info from: ${poolInfoUrl}`);
    const { data: poolInfo } = await axios.get(poolInfoUrl);

    console.log("EVM User balance:", userBalanceInfo.userLiquidity);
    console.log("EVM User rewards:", userBalanceInfo.earned);
    console.log("EVM PoolInfo APR:", poolInfo.apr);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
