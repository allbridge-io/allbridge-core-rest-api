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
    const withdrawAmount = '1';
    const withdrawUrl = `${restApiUrl}/raw/withdraw?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${withdrawAmount}`;
    console.log(`Requesting withdraw transaction from: ${withdrawUrl}`);
    const { data: rawWithdrawTx } = await axios.get(withdrawUrl);

    const txReceipt = await sendTrxRawTransaction(tronWeb, rawWithdrawTx);
    console.log('Token withdraw txReceipt:', txReceipt);
  } catch (error) {
    console.error('Error during execution:', error);
  }
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
