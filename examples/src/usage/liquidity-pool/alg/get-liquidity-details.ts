import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });

const accountAddress = getEnvVar('ALG_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('ALG_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const main = async () => {
  try {
    const { data: userBalanceInfo } = await axios.get(
      `${restApiUrl}/liquidity/details?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`,
    );
    const { data: poolInfo } = await axios.get(
      `${restApiUrl}/pool/info/blockchain?tokenAddress=${tokenAddress}`,
    );

    console.log('Algorand User liquidity:', userBalanceInfo.userLiquidity);
    console.log('Algorand User rewards:', userBalanceInfo.earned);
    console.log('Algorand Pool APR:', poolInfo.apr);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
