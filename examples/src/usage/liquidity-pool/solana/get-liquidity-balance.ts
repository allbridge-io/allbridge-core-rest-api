import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SOL_TOKEN_ADDRESS");
const accountAddress = getEnvVar("SOL_ACCOUNT_ADDRESS");

const main = async () => {
  try {
    // Request user balance info
    const balanceInfoUrl = `${restApiUrl}/liquidity/details?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting user balance info from: ${balanceInfoUrl}`);
    const { data: userBalanceInfo } = await axios.get(balanceInfoUrl);

    // Request pool info
    const poolInfoUrl = `${restApiUrl}/pool/info/blockchain?tokenAddress=${tokenAddress}`;
    console.log(`Requesting pool info from: ${poolInfoUrl}`);
    const { data: poolInfo } = await axios.get(poolInfoUrl);

    console.log("Solana User balance:", userBalanceInfo.userLiquidity);
    console.log("Solana User rewards:", userBalanceInfo.earned);
    console.log("Solana PoolInfo APR:", poolInfo.apr7d);
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
