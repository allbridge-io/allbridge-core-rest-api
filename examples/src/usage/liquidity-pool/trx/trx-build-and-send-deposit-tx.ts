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
    const depositAmount = '1';
    const depositUrl = `${restApiUrl}/raw/deposit?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${depositAmount}`;
    console.log(`Requesting deposit transaction from: ${depositUrl}`);
    const { data: rawDepositTx } = await axios.get(depositUrl);

    const txReceipt = await sendTrxRawTransaction(tronWeb, rawDepositTx);
    console.log('Token deposit txReceipt:', txReceipt);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
