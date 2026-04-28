import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const exampleRawTransaction = {
  visible: false,
  txID: 'transaction-id',
  raw_data: {
    contract: [],
    ref_block_bytes: '0000',
    ref_block_hash: '0000000000000000',
    expiration: 0,
    timestamp: 0,
  },
  raw_data_hex: '00',
};

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('TRX_ACCOUNT_ADDRESS');
  const recipient = getEnvVar('ETH_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const sourceToken = ensure(
    chains['TRX'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDT'),
  );
  const destinationToken = ensure(
    chains['ETH'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDT'),
  );

  const rawBridgeRequestParams = new URLSearchParams({
    amount: toBaseUnits('0.7', sourceToken.decimals),
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    messenger: 'ALLBRIDGE',
    feePaymentMethod: 'WITH_NATIVE_CURRENCY',
  });

  console.log('Requesting Tron raw bridge transaction with params:', {
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

  console.log('Converting Tron raw transaction to hex with params:', {
    rawTransaction,
    expectedRawTransactionShape: exampleRawTransaction,
  });

  const { data } = await axios.get(
    `${restApiUrl}/utils/tron/raw2hex?${convertRequestParams.toString()}`,
  );

  console.log('Tron raw transaction hex:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
