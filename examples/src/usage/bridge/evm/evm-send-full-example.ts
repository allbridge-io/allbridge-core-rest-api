import Web3 from 'web3';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { sendRawTransaction } from '../../../utils/web3';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  // sender address
  const fromAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
  // recipient address
  const toAddress = getEnvVar('TRX_ACCOUNT_ADDRESS');

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

  if (
    //check if sending tokens already approved
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
    // authorize a transfer of tokens from sender's address
    await axios.get(
      `${baseUrl}/raw/approve?ownerAddress=${fromAddress}&tokenAddress=${sourceTokenInfo.tokenAddress}`,
    );
  }

  // initiate transfer
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
    web3,
    rawTransactionTransfer.data,
  );
  console.log('Tokens sent:', txReceipt.transactionHash);
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
