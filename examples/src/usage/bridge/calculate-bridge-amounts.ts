import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../utils/env';
import { toBaseUnits } from '../../utils/amount';
import { ensure } from '../../utils/utils';

dotenv.config({ path: '.env' });

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');

  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const sourceToken = ensure(
    chains['POL'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );
  const destinationToken = ensure(
    chains['TRX'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDT'),
  );

  const amountInt = toBaseUnits('100.5', sourceToken.decimals);
  const quoteRequestParams = new URLSearchParams({
    amount: amountInt,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
  });

  console.log('Requesting bridge quote with params:', {
    amountInt,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
  });

  const { data: bridgeQuote } = await axios.get(
    `${restApiUrl}/bridge/quote?${quoteRequestParams.toString()}`,
  );

  console.log('Bridge quote:', bridgeQuote);
  console.log(
    'Available messenger and fee payment method combinations:',
    bridgeQuote.options.map(
      (option: {
        messenger: string;
        paymentMethods: { feePaymentMethod: string }[];
      }) => ({
        messenger: option.messenger,
        feePaymentMethods: option.paymentMethods.map((paymentMethod) => paymentMethod.feePaymentMethod),
      }),
    ),
  );
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
