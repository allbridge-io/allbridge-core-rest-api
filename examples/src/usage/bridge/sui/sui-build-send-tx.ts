import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import { sendSuiRawTransaction } from '../../../utils/sui';

dotenv.config({ path: '.env' });
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  // sender address
  const accountAddress = getEnvVar("SUI_ACCOUNT_ADDRESS");
  // recipient address
  const toAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['SUI'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );

  const destinationChain = chains['ETH'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find(
      (tokenInfo: any) => tokenInfo.symbol === 'USDC',
    ),
  );

  const amountInt = parseFloat('1.01') * 10 ** sourceTokenInfo.decimals;

  // initiate transfer
  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/bridge?amount=${amountInt}` +
    `&sender=${accountAddress}` +
    `&recipient=${toAddress}` +
    `&sourceToken=${sourceTokenInfo.tokenAddress}` +
    `&destinationToken=${destinationTokenInfo.tokenAddress}` +
    `&messenger=ALLBRIDGE` +
    `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
  );

  const txReceipt = await sendSuiRawTransaction(rawTransactionTransfer.data);
  console.log("tx id:", txReceipt);
};

main()
.then(() => {
  console.log('Done');
})
.catch((e) => {
  console.error(e);
});
