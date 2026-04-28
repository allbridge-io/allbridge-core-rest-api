import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const tokenAddress = getEnvVar('ALG_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const main = async () => {
  try {
    const { data } = await axios.get(
      `${restApiUrl}/liquidity/deposit/calculate?amount=1&tokenAddress=${tokenAddress}`,
    );
    console.log('Estimated LP amount on Algorand deposit:', data);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
