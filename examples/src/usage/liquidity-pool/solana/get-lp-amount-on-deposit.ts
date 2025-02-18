import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SOL_TOKEN_ADDRESS");

const main = async () => {
  try {
    const amount = "1";
    // Request deposit estimation
    const depositEstimateUrl = `${restApiUrl}/liquidity/deposit/calculate?amount=${amount}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting deposit estimation from: ${depositEstimateUrl}`);
    const { data: depositEstimate } = await axios.get(depositEstimateUrl);

    console.log(`If you send ${amount}, then ${depositEstimate} LP tokens will be deposited`);
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
