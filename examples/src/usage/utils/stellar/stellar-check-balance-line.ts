import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const accountAddress = getEnvVar('SRB_ACCOUNT_ADDRESS');
  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const token = ensure(
    chains['SRB'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );
  const requestParams = new URLSearchParams({
    address: accountAddress,
    token: token.tokenAddress,
  });

  console.log('Checking Stellar balance line with params:', {
    accountAddress,
    tokenSymbol: token.symbol,
    tokenAddress: token.tokenAddress,
  });

  const { data } = await axios.get(`${restApiUrl}/check/stellar/balanceline?${requestParams.toString()}`);

  console.log('Stellar balance line:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
