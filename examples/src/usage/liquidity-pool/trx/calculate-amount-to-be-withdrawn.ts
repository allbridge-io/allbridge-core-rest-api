import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const accountAddress = getEnvVar('TRX_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('TRX_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const main = async () => {
  try {
    const { data } = await axios.get(
      `${restApiUrl}/liquidity/withdrawn/calculate?amount=1&ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`,
    );
    console.log('Estimated withdrawn amount on Tron:', data);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
