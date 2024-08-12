import Web3 from 'web3';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import Big from 'big.js';

dotenv.config({ path: '.env' });
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  // sender address
  const fromAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');

  // configure web3
  const web3 = new Web3(getEnvVar('WEB3_PROVIDER_URL'));
  const account = web3.eth.accounts.privateKeyToAccount(
    getEnvVar('ETH_PRIVATE_KEY'),
  );
  web3.eth.accounts.wallet.add(account);

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
  const amountInt = parseFloat('1.01') * 10 ** sourceTokenInfo.decimals;

  //const gasFeePaymentMethod = 'WITH_STABLECOIN';
  const gasFeePaymentMethod = 'WITH_NATIVE_CURRENCY';

  let totalAmountInt;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (gasFeePaymentMethod === 'WITH_STABLECOIN') {
    const gasFeeOptions = (
      await axios.get(
        `${baseUrl}/gas/fee` +
          `?sourceToken=${sourceTokenInfo.tokenAddress}` +
          `&destinationToken=${destinationTokenInfo.tokenAddress}` +
          `&messenger=ALLBRIDGE`,
      )
    ).data;
    const gasFeeAmount = ensure(gasFeeOptions['stablecoin']);
    const gasFeeAmountInt = gasFeeAmount.int;
    // checking allowance for amount + gas fee
    totalAmountInt = new Big(amountInt).add(gasFeeAmountInt).toFixed();
  } else {
    // checking allowance for just amount
    totalAmountInt = amountInt;
  }

  const allowance = (
    await axios.get(
      `${baseUrl}/check/allowance` +
        `?amount=${totalAmountInt}` +
        `&ownerAddress=${fromAddress}` +
        `&tokenAddress=${sourceTokenInfo.tokenAddress}` +
        `&feePaymentMethod=${gasFeePaymentMethod}`,
    )
  ).data;
  if (
    // check if tokens already approved
    allowance
  ) {
    console.log('The granted allowance is enough for the transaction');
  } else {
    console.log('The granted allowance is NOT enough for the transaction');
  }
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
