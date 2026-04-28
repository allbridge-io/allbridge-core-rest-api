import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const accountAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('ETH_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const main = async () => {
  try {
    const balanceResponse = await axios.get(
      `${restApiUrl}/token/balance?address=${accountAddress}&token=${tokenAddress}`
    );
    console.log("Token Balance: ", balanceResponse.data.balance);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
