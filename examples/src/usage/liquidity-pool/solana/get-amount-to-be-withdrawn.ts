import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SOL_TOKEN_ADDRESS");
const accountAddress = getEnvVar("SOL_ACCOUNT_ADDRESS");

const main = async () => {
  try {
    const amount = "0.5"; // Amount to withdraw
    // Request estimated amount of tokens to be received upon withdrawal
    const withdrawCalcUrl = `${restApiUrl}/liquidity/withdrawn/calculate?amount=${amount}&ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting withdrawal calculation from: ${withdrawCalcUrl}`);
    const { data: estimatedAmount } = await axios.get(withdrawCalcUrl);

    console.log(`If you withdraw ${amount} LP tokens, then`, estimatedAmount, "will be received");
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
