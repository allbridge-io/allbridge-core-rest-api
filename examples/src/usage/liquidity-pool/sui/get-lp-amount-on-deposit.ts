import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });
const tokenAddress = getEnvVar("SUI_TOKEN_ADDRESS");
const restApiUrl = getEnvVar("REST_API_URL");

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
