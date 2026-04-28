import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import {
  createSigner,
  sendRawTransaction,
} from '../../../utils/ethers';
import { Big } from 'big.js';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const fromAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
  const toAddress = getEnvVar('POL_ACCOUNT_ADDRESS');

  const signer = createSigner(
    getEnvVar('WEB3_PROVIDER_URL'),
    getEnvVar('ETH_PRIVATE_KEY'),
  );

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['ETH'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );

  const destinationChain = chains['POL'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find(
      (tokenInfo: any) => tokenInfo.symbol === 'USDC',
    ),
  );

  const amountToSendInt = toBaseUnits('5', sourceTokenInfo.decimals);
  const gasFeeOptions = (
    await axios.get(
      `${baseUrl}/gas/fee` +
        `?sourceToken=${sourceTokenInfo.tokenAddress}` +
        `&destinationToken=${destinationTokenInfo.tokenAddress}` +
        `&messenger=ALLBRIDGE`,
    )
  ).data;
  const gasFeeAmount = ensure(gasFeeOptions['stablecoin']);

  const rawTransactionApprove = await axios.get(
    `${baseUrl}/raw/approve?ownerAddress=${fromAddress}&tokenAddress=${sourceTokenInfo.tokenAddress}`,
  );
  const approveTxReceipt = await sendRawTransaction(
    signer,
    rawTransactionApprove.data,
  );
  console.log('approve tx id:', approveTxReceipt.hash);

  const gasFeeAmountInt = gasFeeAmount.int;
  const totalAmountInt = new Big(amountToSendInt)
    .add(gasFeeAmountInt)
    .toFixed();
  console.log(
    `Sending ${amountToSendInt} ${sourceTokenInfo.symbol} (gas fee ${gasFeeAmountInt} ${sourceTokenInfo.symbol}). Total amount: ${totalAmountInt} ${sourceTokenInfo.symbol}`,
  );

  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/bridge?amount=${totalAmountInt}` +
      `&sender=${fromAddress}` +
      `&recipient=${toAddress}` +
      `&sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&messenger=ALLBRIDGE` +
      `&feePaymentMethod=WITH_STABLECOIN` +
      `&fee=${gasFeeAmount.int}`,
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
