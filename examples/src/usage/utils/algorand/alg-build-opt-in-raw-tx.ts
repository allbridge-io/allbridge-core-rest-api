import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const exampleOptInTarget = {
  id: '31566704',
  type: 'asset',
};

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('ALG_ACCOUNT_ADDRESS');
  const optInTargetId = getEnvVar('ALG_OPT_IN_ID');
  const optInTargetType = getEnvVar('ALG_OPT_IN_TYPE', 'asset');
  const requestParams = new URLSearchParams({
    sender,
    id: optInTargetId,
    type: optInTargetType,
  });

  console.log('Building Algorand opt-in raw transaction with params:', {
    sender,
    optInTargetId,
    optInTargetType,
    expectedOptInTargetShape: exampleOptInTarget,
  });

  const { data } = await axios.get(`${restApiUrl}/raw/algorand/optin/?${requestParams.toString()}`);

  console.log('Algorand opt-in raw transaction:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
