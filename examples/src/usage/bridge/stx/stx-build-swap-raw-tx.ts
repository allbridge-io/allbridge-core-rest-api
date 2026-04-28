import axios from 'axios';
import * as dotenv from 'dotenv';
import { sendStxRawTransaction } from '../../../utils/stx';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('STX_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceToken = ensure(
    chains['STX'].tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );
  const destinationToken = ensure(
    chains['STX'].tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDT'),
  );

  const amount = toBaseUnits('1', sourceToken.decimals);

  const { data: rawTx } = await axios.get(
    `${baseUrl}/raw/swap?amount=${amount}` +
      `&sender=${sender}` +
      `&recipient=${sender}` +
      `&sourceToken=${sourceToken.tokenAddress}` +
      `&destinationToken=${destinationToken.tokenAddress}`,
  );

  console.log('Stacks swap raw transaction:');
  console.log(rawTx);

  console.log(`Sending ${amount} ${sourceToken.symbol}`);
  const txId = await sendStxRawTransaction(rawTx);
  console.log("txId:", txId);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
