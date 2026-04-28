import axios from 'axios';
import * as dotenv from 'dotenv';
import { TronWeb } from 'tronweb';
import { getEnvVar } from '../../../utils/env';
import { sendTrxRawTransaction } from '../../../utils/tronWeb';

dotenv.config({ path: '.env' });

const tronProviderUrl = getEnvVar('TRONWEB_PROVIDER_URL');
const trxPrivateKey = getEnvVar('TRX_PRIVATE_KEY');
const accountAddress = getEnvVar('TRX_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('TRX_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const tronWeb = new TronWeb(tronProviderUrl, tronProviderUrl, tronProviderUrl, trxPrivateKey);

const main = async () => {
  try {
    const claimUrl = `${restApiUrl}/raw/claim?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting claim rewards transaction from: ${claimUrl}`);
    const { data: rawClaimTx } = await axios.get(claimUrl);

    const txReceipt = await sendTrxRawTransaction(tronWeb, rawClaimTx);
    console.log('Rewards claim txReceipt:', txReceipt);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
