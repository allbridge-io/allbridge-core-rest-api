import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';
import {
  createSigner,
  sendRawTransaction,
} from '../../../utils/ethers';

dotenv.config({ path: '.env' });

const rpcUrl = getEnvVar('WEB3_PROVIDER_URL');
const privateKey = getEnvVar('ETH_PRIVATE_KEY');
const accountAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('ETH_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const signer = createSigner(rpcUrl, privateKey);

const main = async () => {
  const amount = '1';

  const yieldTokensResponse = await axios.get(`${restApiUrl}/yield/tokens`);
  const cydToken = ensure(
    yieldTokensResponse.data.find((token: any) => token.chainSymbol === 'ETH'),
  );
  const tokenDetailsResponse = await axios.get(
    `${restApiUrl}/token/details?address=${tokenAddress}`,
  );
  const sourceToken = ensure(tokenDetailsResponse.data);
  const amountInt = toBaseUnits(amount, sourceToken.decimals);
  const yieldAmountInt = toBaseUnits(amount, cydToken.decimals);

  console.log(
    'allowance',
    (await axios.get(`${restApiUrl}/yield/allowance?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`)).data,
  );
  const checkAllowance = (
    await axios.get(
      `${restApiUrl}/check/yield/allowance?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${amountInt}`,
    )
  ).data;
  console.log('checkAllowance', checkAllowance);

  if (!checkAllowance) {
    const approveTx = (
      await axios.get(
        `${restApiUrl}/raw/yield/approve?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`,
      )
    ).data;
    const txReceipt = await sendRawTransaction(signer, approveTx);
    console.log('Approve tx:', txReceipt.hash);
  }

  console.log(
    'balanceOf',
    (await axios.get(`${restApiUrl}/yield/balance?address=${accountAddress}&token=${cydToken.yieldAddress}`))
      .data,
  );
  const depositEstimate = (
    await axios.get(
      `${restApiUrl}/yield/deposit/calculate?tokenAddress=${tokenAddress}&amount=${amountInt}`,
    )
  ).data;
  console.log(
    `getEstimatedAmountOnDeposit ${amount}->`,
    depositEstimate,
  );
  console.log(
    `getWithdrawProportionAmount ${amount}->`,
    (
      await axios.get(
        `${restApiUrl}/yield/withdrawn/calculate?ownerAddress=${accountAddress}&yieldAddress=${cydToken.yieldAddress}&amount=${yieldAmountInt}`,
      )
    ).data,
  );

  const rawTransactionDeposit = (
    await axios.get(
      `${restApiUrl}/raw/yield/deposit?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${amountInt}&minVirtualAmount=${depositEstimate}`,
    )
  ).data;
  const txReceiptDeposit = await sendRawTransaction(signer, rawTransactionDeposit);
  console.log('Yield deposit tx:', txReceiptDeposit.hash);

  const rawTransactionWithdraw = (
    await axios.get(
      `${restApiUrl}/raw/yield/withdraw?ownerAddress=${accountAddress}&yieldAddress=${cydToken.yieldAddress}&amount=${yieldAmountInt}`,
    )
  ).data;
  const txReceiptWithdraw = await sendRawTransaction(signer, rawTransactionWithdraw);
  console.log('Yield withdraw tx:', txReceiptWithdraw.hash);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
