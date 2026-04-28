import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import Big from 'big.js';
import { toBaseUnits } from '../../../utils/amount';

dotenv.config({ path: '.env' });
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const fromAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['ETH'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );
  const destinationChain = chains['TRX'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find(
      (tokenInfo: any) => tokenInfo.symbol === 'USDT',
    ),
  );
  const amountInt = toBaseUnits('1.01', sourceTokenInfo.decimals);

  const gasFeePaymentMethod = 'WITH_NATIVE_CURRENCY';

  let totalAmountInt;
  if (gasFeePaymentMethod === 'WITH_STABLECOIN') {
    const gasFeeOptions = (
      await axios.get(
        `${baseUrl}/gas/fee` +
          `?sourceToken=${sourceTokenInfo.tokenAddress}` +
          `&destinationToken=${destinationTokenInfo.tokenAddress}` +
          `&messenger=ALLBRIDGE`,
      )
    ).data;
    const gasFeeAmount = ensure(gasFeeOptions['stablecoin']);
    const gasFeeAmountInt = gasFeeAmount.int;
    totalAmountInt = new Big(amountInt).add(gasFeeAmountInt).toFixed();
  } else {
    totalAmountInt = amountInt;
  }

  const allowance = (
    await axios.get(
      `${baseUrl}/check/allowance` +
        `?amount=${totalAmountInt}` +
        `&ownerAddress=${fromAddress}` +
        `&tokenAddress=${sourceTokenInfo.tokenAddress}` +
        `&feePaymentMethod=${gasFeePaymentMethod}`,
    )
  ).data;
  if (
    allowance
  ) {
    console.log('The granted allowance is enough for the transaction');
  } else {
    console.log('The granted allowance is NOT enough for the transaction');
  }
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
