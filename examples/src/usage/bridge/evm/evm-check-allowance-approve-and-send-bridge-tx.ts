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
  const toAddress = getEnvVar('TRX_ACCOUNT_ADDRESS');

  const signer = createSigner(
    getEnvVar('WEB3_PROVIDER_URL'),
    getEnvVar('ETH_PRIVATE_KEY'),
  );

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

  if (
    !(
      await axios.get(
        `${baseUrl}/check/allowance` +
          `?amount=${amountInt}` +
          `&ownerAddress=${fromAddress}` +
          `&tokenAddress=${sourceTokenInfo.tokenAddress}` +
          `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
      )
    ).data
  ) {
    const rawTransactionApprove = await axios.get(
      `${baseUrl}/raw/approve?ownerAddress=${fromAddress}&tokenAddress=${sourceTokenInfo.tokenAddress}`,
    );
    const approveTxReceipt = await sendRawTransaction(
      signer,
      rawTransactionApprove.data,
    );
    console.log('approve tx id:', approveTxReceipt.hash);
  }

  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/bridge?amount=${amountInt}` +
      `&sender=${fromAddress}` +
      `&recipient=${toAddress}` +
      `&sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&messenger=ALLBRIDGE` +
      `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
  );
  const txReceipt = await sendRawTransaction(
    signer,
    rawTransactionTransfer.data,
  );
  console.log('bridge tx id:', txReceipt.hash);
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
