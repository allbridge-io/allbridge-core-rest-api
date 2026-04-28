import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import {
  createSigner,
  sendRawTransaction,
} from '../../../utils/ethers';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const fromAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
  const toAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');

  const signer = createSigner(
    getEnvVar('WEB3_PROVIDER_URL'),
    getEnvVar('ETH_PRIVATE_KEY'),
  );

    console.log(`Fetching supported chains...`);
    const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['ETH'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDT'),
  );

  const destinationChain = chains['ETH'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find(
      (tokenInfo: any) => tokenInfo.symbol === 'USDC',
    ),
  );

  const amountStr = '1.01';
  const amount = toBaseUnits(amountStr, sourceTokenInfo.decimals);

  console.log(`Calculating minimum receive amount...`);
  const response = await axios.get(
    `${baseUrl}/bridge/receive/calculate` +
      `?sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&amount=${amount}` +
      `&messenger=ALLBRIDGE`,
  );
  const minimumReceiveAmount = response.data.amountReceivedInFloat;
  if (Number.isNaN(Number(minimumReceiveAmount))) {
    throw new Error('Invalid minimum receive amount received from API');
  }
  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/swap?amount=${amount}` +
      `&sender=${fromAddress}` +
      `&recipient=${toAddress}` +
      `&sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&minimumReceiveAmount=${toBaseUnits(minimumReceiveAmount, destinationTokenInfo.decimals)}`,
  );

  console.log(
    `Swapping ${amountStr} ${sourceTokenInfo.symbol}`,
  );
  const txReceipt = await sendRawTransaction(
    signer,
    rawTransactionTransfer.data,
  );
  console.log('tx id:', txReceipt.hash);
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
