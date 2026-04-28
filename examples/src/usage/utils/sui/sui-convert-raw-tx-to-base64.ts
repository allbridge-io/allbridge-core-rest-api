import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const exampleRawTransaction = {
  version: 2,
  sender: '0xsender',
  expiration: { None: true },
  gasData: {
    budget: '1',
    price: '1',
    owner: '0xsender',
    payment: [],
  },
};

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('SUI_ACCOUNT_ADDRESS');
  const recipient = getEnvVar('ETH_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const sourceToken = ensure(
    chains['SUI'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );
  const destinationToken = ensure(
    chains['ETH'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );

  const rawBridgeRequestParams = new URLSearchParams({
    amount: toBaseUnits('1.01', sourceToken.decimals),
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    messenger: 'ALLBRIDGE',
    feePaymentMethod: 'WITH_NATIVE_CURRENCY',
  });

  console.log('Requesting Sui raw bridge transaction with params:', {
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    amount: rawBridgeRequestParams.get('amount'),
  });
  const { data: rawTransaction } = await axios.get(
    `${restApiUrl}/raw/bridge?${rawBridgeRequestParams.toString()}`,
  );

  const convertRequestParams = new URLSearchParams({
    rawTx: JSON.stringify(rawTransaction),
  });

  console.log('Converting Sui raw transaction to base64 with params:', {
    rawTransaction,
    expectedRawTransactionShape: exampleRawTransaction,
  });

  const { data } = await axios.get(
    `${restApiUrl}/utils/sui/raw2base64?${convertRequestParams.toString()}`,
  );

  console.log('Sui raw transaction in base64:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
