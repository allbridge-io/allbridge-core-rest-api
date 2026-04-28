import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar, getJsonEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const exampleInputCoin = {
  $kind: 'Result',
  Result: 0,
};

const exampleBaseTransaction = 'AAABAAEBAQ==';

const exampleSendParamsShape = {
  amount: '1',
  fromAccountAddress: '0xsource',
  toAccountAddress: '0xdestination',
  sourceToken: {
    tokenAddress: '0xsource-token',
    chainSymbol: 'SUI',
    decimals: 6,
  },
  destinationToken: {
    tokenAddress: '0xdestination-token',
    chainSymbol: 'SUI',
    decimals: 6,
  },
};

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const baseTx = getEnvVar('SUI_BASE_TX');
  const inputCoin = getJsonEnvVar<Record<string, unknown>>('SUI_INPUT_COIN');
  const sender = getEnvVar('SUI_ACCOUNT_ADDRESS');
  const recipient = getEnvVar('ETH_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const sourceToken = ensure(
    chains['SUI'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );
  const destinationToken = ensure(
    chains['ETH'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );

  const sendParams = {
    amount: '1',
    fromAccountAddress: sender,
    toAccountAddress: recipient,
    sourceToken,
    destinationToken,
  };
  const requestParams = new URLSearchParams({
    baseTx,
    inputCoin: JSON.stringify(inputCoin),
    params: JSON.stringify(sendParams),
  });

  console.log('Building Sui raw transaction from custom tx with params:', {
    baseTx,
    inputCoin,
    sendParams,
    expectedBaseTxShape: exampleBaseTransaction,
    expectedInputCoinShape: exampleInputCoin,
    expectedSendParamsShape: exampleSendParamsShape,
  });

  const { data } = await axios.get(`${restApiUrl}/utils/sui/build-send-from-custom-tx?${requestParams.toString()}`);

  console.log('Sui bridge raw transaction built from custom tx:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
