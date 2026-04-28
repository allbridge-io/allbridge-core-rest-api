import axios from 'axios';
import * as dotenv from 'dotenv';
import { sendStxRawTransaction } from '../../../utils/stx';
import { getEnvVar } from '../../../utils/env';
import { fromBaseUnits, toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('STX_ACCOUNT_ADDRESS');
  const recipient = getEnvVar('ETH_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceToken = ensure(
    chains['STX'].tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDCx'),
  );
  const destinationToken = ensure(
    chains['SPL'].tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );

  const amount = toBaseUnits('5', sourceToken.decimals);

  const { data: rawTx } = await axios.get(
    `${baseUrl}/raw/bridge?amount=${amount}` +
      `&sender=${sender}` +
      `&recipient=${recipient}` +
      `&sourceToken=${sourceToken.tokenAddress}` +
      `&destinationToken=${destinationToken.tokenAddress}` +
      `&messenger=ALLBRIDGE` +
      `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
  );

  console.log('Stacks bridge raw transaction:');
  console.log(rawTx);

  console.log(`Sending ${fromBaseUnits(amount, sourceToken.decimals)} ${sourceToken.symbol}`);

  const txId = await sendStxRawTransaction(rawTx);
  console.log("txId:", txId);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
