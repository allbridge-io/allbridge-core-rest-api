import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import { sendAlgRawTransaction } from '../../../utils/alg';
import { toBaseUnits } from '../../../utils/amount';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const accountAddress = getEnvVar('ALG_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['ALG'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );
  const destinationTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDT'),
  );

  const amountInt = toBaseUnits('0.15', sourceTokenInfo.decimals);
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

  const txId = await sendAlgRawTransaction(rawTransactionTransfer.data);
  console.log('tx id:', txId);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
