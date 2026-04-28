import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const accountAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
const tokenAddress = getEnvVar("ETH_TOKEN_ADDRESS");
const restApiUrl = getEnvVar("REST_API_URL");

const main = async () => {
  try {
    const balanceUrl = `${restApiUrl}/liquidity/details?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting user balance info from: ${balanceUrl}`);
    const { data: userBalanceInfo } = await axios.get(balanceUrl);

    const poolInfoUrl = `${restApiUrl}/pool/info/blockchain?tokenAddress=${tokenAddress}`;
    console.log(`Requesting pool info from: ${poolInfoUrl}`);
    const { data: poolInfo } = await axios.get(poolInfoUrl);

    console.log("EVM User liquidity:", userBalanceInfo.userLiquidity);
    console.log("EVM User rewards:", userBalanceInfo.earned);
    console.log("EVM Pool APR:", poolInfo.apr);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
