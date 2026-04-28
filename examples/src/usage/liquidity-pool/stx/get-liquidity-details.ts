import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const main = async () => {
  const accountAddress = getEnvVar('STX_ACCOUNT_ADDRESS');
  const tokenAddress = getEnvVar('STX_TOKEN_ADDRESS');
  const restApiUrl = getEnvVar('REST_API_URL');

  const { data } = await axios.get(
    `${restApiUrl}/liquidity/details?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`,
  );

  console.log('Stacks liquidity details:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
