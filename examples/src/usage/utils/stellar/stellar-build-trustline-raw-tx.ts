import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('SRB_ACCOUNT_ADDRESS');
  const trustlineLimit = getEnvVar('STELLAR_TRUSTLINE_LIMIT', '1000000');
  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const token = ensure(
    chains['SRB'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );
  const requestParams = new URLSearchParams({
    sender,
    tokenAddress: token.tokenAddress,
    limit: trustlineLimit,
  });

  console.log('Building Stellar trustline transaction with params:', {
    sender,
    tokenSymbol: token.symbol,
    tokenAddress: token.tokenAddress,
    trustlineLimit,
  });

  const { data } = await axios.get(`${restApiUrl}/raw/stellar/trustline?${requestParams.toString()}`);

  console.log('Stellar trustline XDR:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
