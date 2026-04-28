import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';
import { sendSuiRawTransaction } from '../../../utils/sui';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const accountAddress = getEnvVar('SUI_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['SUI'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );
  const destinationTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDT'),
  );

  const amountInt = toBaseUnits('1.01', sourceTokenInfo.decimals);
  const receiveAmountResponse = await axios.get(
    `${baseUrl}/bridge/receive/calculate?amount=${amountInt}` +
      `&sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&messenger=ALLBRIDGE`,
  );
  const minimumReceiveAmountInt = toBaseUnits(
    receiveAmountResponse.data.amountReceivedInFloat,
    destinationTokenInfo.decimals,
  );

  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/swap?amount=${amountInt}` +
      `&sender=${accountAddress}` +
      `&recipient=${accountAddress}` +
      `&sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&minimumReceiveAmount=${minimumReceiveAmountInt}`,
  );

  const txReceipt = await sendSuiRawTransaction(rawTransactionTransfer.data);
  console.log('tx id:', txReceipt.digest);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
