import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const main = async () => {
  const tokenAddress = getEnvVar('STX_TOKEN_ADDRESS');
  const restApiUrl = getEnvVar('REST_API_URL');

  const { data } = await axios.get(
    `${restApiUrl}/liquidity/deposit/calculate?amount=1&tokenAddress=${tokenAddress}`,
  );

  console.log('Estimated LP amount on Stacks deposit:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
