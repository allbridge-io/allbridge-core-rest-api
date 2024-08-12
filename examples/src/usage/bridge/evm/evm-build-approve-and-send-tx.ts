import Web3 from 'web3';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { sendRawTransaction } from '../../../utils/web3';
import { ensure } from '../../../utils/utils';
import { TransactionConfig } from 'web3-core';

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

  const amount = parseFloat('1.01') * 10 ** sourceTokenInfo.decimals;

  // authorize the bridge to transfer tokens from sender's address
  const rawTransactionApprove = await axios.get(
    `${baseUrl}/raw/approve?ownerAddress=${fromAddress}&tokenAddress=${sourceTokenInfo.tokenAddress}`,
  );
  const approveTxReceipt = await sendRawTransaction(
    web3,
    rawTransactionApprove.data as TransactionConfig,
  );
  console.log('approve tx id:', approveTxReceipt.transactionHash);

  // initiate transfer
  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/bridge?amount=${amount}` +
      `&sender=${fromAddress}` +
      `&recipient=${toAddress}` +
      `&sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&messenger=ALLBRIDGE` +
      `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
  );

  console.log(
    `Sending ${amount / 10 ** sourceTokenInfo.decimals} ${sourceTokenInfo.symbol}`,
  );
  const txReceipt = await sendRawTransaction(
    web3,
    rawTransactionTransfer.data as TransactionConfig,
  );
  console.log('tx id:', txReceipt.transactionHash);
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
