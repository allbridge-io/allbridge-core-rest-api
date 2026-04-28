import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('SOL_ACCOUNT_ADDRESS');
  const recipient = getEnvVar('SOL_ACCOUNT_ADDRESS');
  const memo = getEnvVar('SOL_TX_MEMO', 'allbridge memo');
  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const sourceToken = ensure(
    chains['SOL'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );
  const destinationToken = ensure(
    chains['SOL'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDT'),
  );

  const amount = toBaseUnits('10', sourceToken.decimals);
  const detailsRequestParams = new URLSearchParams({
    amount,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
  });
  const { data: swapDetails } = await axios.get(
    `${restApiUrl}/swap/details?${detailsRequestParams.toString()}`,
  );
  const minimumReceiveAmount = toBaseUnits(
    swapDetails.amountReceivedInFloat,
    destinationToken.decimals,
  );

  const rawSwapRequestParams = new URLSearchParams({
    amount,
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    minimumReceiveAmount,
  });

  console.log('Requesting Solana raw swap transaction with params:', {
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    amount,
    minimumReceiveAmount,
  });
  const { data: rawTransactionHex } = await axios.get(
    `${restApiUrl}/raw/swap?${rawSwapRequestParams.toString()}`,
  );

  const addMemoRequestParams = new URLSearchParams({
    tx: rawTransactionHex,
    memo,
  });

  console.log('Adding memo to Solana raw transaction with params:', {
    rawTransactionHex,
    memo,
  });

  const { data } = await axios.get(
    `${restApiUrl}/utils/solana/add-memo?${addMemoRequestParams.toString()}`,
  );

  console.log('Solana raw transaction with memo:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
