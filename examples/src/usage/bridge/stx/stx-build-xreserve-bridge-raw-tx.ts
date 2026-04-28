import { deserializeTransaction } from '@stacks/transactions';
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
  const recipient = getEnvVar('ETH_ACCOUNT_ADDRESS');

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceToken = ensure(
    chains['STX'].tokens.find(
      (tokenInfo: { symbol: string; xReserve?: unknown }) =>
        tokenInfo.symbol === 'USDCx' && tokenInfo.xReserve,
    ),
  );
  const destinationToken = ensure(
    chains['SPL'].tokens.find(
      (tokenInfo: { symbol: string; xReserve?: unknown }) =>
        tokenInfo.symbol === 'USDC' && tokenInfo.xReserve,
    ),
  );

  const amount = toBaseUnits('5', sourceToken.decimals);
  const requestParams = new URLSearchParams({
    amount: String(amount),
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    messenger: 'X_RESERVE',
    feePaymentMethod: 'WITH_NATIVE_CURRENCY',
  });

  console.log('Requesting Stacks xReserve bridge raw transaction with params:', {
    amount: String(amount),
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    messenger: 'X_RESERVE',
    feePaymentMethod: 'WITH_NATIVE_CURRENCY',
  });

  const { data: rawTx } = await axios.get(
    `${baseUrl}/raw/bridge?${requestParams.toString()}`,
  );

  console.log('Stacks xReserve bridge raw transaction:');
  console.log(rawTx);

  console.log(`Sending ${amount} ${sourceToken.symbol}`);
  const decoded = deserializeTransaction(rawTx);

  console.log(decoded);
  console.log(decoded.postConditions.values);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
