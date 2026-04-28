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

  console.log('Checking Algorand opt-in with params:', {
    sender,
    optInTargetId,
    optInTargetType,
    expectedOptInTargetShape: exampleOptInTarget,
  });

  const { data } = await axios.get(`${restApiUrl}/check/algorand/optin?${requestParams.toString()}`);

  console.log('Algorand opt-in status:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
