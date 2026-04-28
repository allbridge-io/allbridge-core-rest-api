import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const accountAddress = getEnvVar('STX_ACCOUNT_ADDRESS');
  const tokenAddress = getEnvVar('STX_TOKEN_ADDRESS');

  const { data } = await axios.get(
    `${restApiUrl}/token/balance?address=${accountAddress}&token=${tokenAddress}`,
  );

  console.log('Stacks token balance:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
