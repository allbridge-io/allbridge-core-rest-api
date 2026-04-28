import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const accountAddress = getEnvVar('STX_ACCOUNT_ADDRESS');

  const { data } = await axios.get(
    `${restApiUrl}/token/native/balance?address=${accountAddress}&chain=STX`,
  );

  console.log('Stacks native balance:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
