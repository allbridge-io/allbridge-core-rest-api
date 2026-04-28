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
    const claimUrl = `${restApiUrl}/raw/claim?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting claim rewards transaction from: ${claimUrl}`);
    const { data: rawClaimTx } = await axios.get(claimUrl);

    const txId = await sendAlgRawTransaction(rawClaimTx);
    console.log('Rewards claim:', txId);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
