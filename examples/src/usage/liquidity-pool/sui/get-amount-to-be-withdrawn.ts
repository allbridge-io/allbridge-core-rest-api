import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });
const accountAddress = getEnvVar("SUI_ACCOUNT_ADDRESS");
const tokenAddress = getEnvVar("SUI_TOKEN_ADDRESS");
const restApiUrl = getEnvVar("REST_API_URL");

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
