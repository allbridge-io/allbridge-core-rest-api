import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const main = async () => {
  const accountAddress = getEnvVar('STX_ACCOUNT_ADDRESS');
  const tokenAddress = getEnvVar('STX_TOKEN_ADDRESS');
  const restApiUrl = getEnvVar('REST_API_URL');

  const { data: rawDepositTx } = await axios.get(
    `${restApiUrl}/raw/deposit?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=1`,
  );

  console.log('Stacks pool deposit raw transaction:');
  console.log(rawDepositTx);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
