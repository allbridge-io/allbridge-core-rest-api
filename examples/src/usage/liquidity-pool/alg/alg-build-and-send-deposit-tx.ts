import axios from 'axios';
import * as dotenv from 'dotenv';
import { sendAlgRawTransaction } from '../../../utils/alg';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const accountAddress = getEnvVar('ALG_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('ALG_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const main = async () => {
  try {
    const depositAmount = '1.1';
    const depositUrl = `${restApiUrl}/raw/deposit?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${depositAmount}`;
    console.log(`Requesting deposit transaction from: ${depositUrl}`);
    const { data: rawDepositTx } = await axios.get(depositUrl);

    const txId = await sendAlgRawTransaction(rawDepositTx);
    console.log('Token deposit:', txId);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
