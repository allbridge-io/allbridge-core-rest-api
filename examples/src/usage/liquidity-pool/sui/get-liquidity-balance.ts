import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });
const accountAddress = getEnvVar("SUI_ACCOUNT_ADDRESS");
const tokenAddress = getEnvVar("SUI_TOKEN_ADDRESS");
const restApiUrl = getEnvVar("REST_API_URL");

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

    console.log("SUI User balance:", userBalanceInfo.userLiquidity);
    console.log("SUI User rewards:", userBalanceInfo.earned);
    console.log("SUI PoolInfo APR:", poolInfo.apr);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
