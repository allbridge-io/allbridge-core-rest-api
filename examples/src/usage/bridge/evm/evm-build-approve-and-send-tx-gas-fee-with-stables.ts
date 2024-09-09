import Web3 from 'web3';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { sendRawTransaction } from '../../../utils/web3';
import { Big } from 'big.js';
import { ensure } from '../../../utils/utils';
import { TransactionConfig } from 'web3-core';

dotenv.config({ path: '.env' });
const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  // sender address
  const fromAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
  // recipient address
  const toAddress = getEnvVar('POL_ACCOUNT_ADDRESS');

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

  const destinationChain = chains['POL'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find(
      (tokenInfo: any) => tokenInfo.symbol === 'USDC',
    ),
  );

  const amountToSendInt = parseFloat('5') * 10 ** sourceTokenInfo.decimals;
  const gasFeeOptions = (
    await axios.get(
      `${baseUrl}/gas/fee` +
        `?sourceToken=${sourceTokenInfo.tokenAddress}` +
        `&destinationToken=${destinationTokenInfo.tokenAddress}` +
        `&messenger=ALLBRIDGE`,
    )
  ).data;
  const gasFeeAmount = ensure(gasFeeOptions['stablecoin']);

  // authorize the bridge to transfer tokens from sender's address
  const rawTransactionApprove = await axios.get(
    `${baseUrl}/raw/approve?ownerAddress=${fromAddress}&tokenAddress=${sourceTokenInfo.tokenAddress}`,
  );
  const approveTxReceipt = await sendRawTransaction(
    web3,
    rawTransactionApprove.data as TransactionConfig,
  );
  console.log('approve tx id:', approveTxReceipt.transactionHash);

  const gasFeeAmountInt = gasFeeAmount.int;
  const totalAmountInt = new Big(amountToSendInt)
    .add(gasFeeAmountInt)
    .toFixed();
  console.log(
    `Sending ${amountToSendInt} ${sourceTokenInfo.symbol} (gas fee ${gasFeeAmountInt} ${sourceTokenInfo.symbol}). Total amount: ${totalAmountInt} ${sourceTokenInfo.symbol}`,
  );

  // initiate transfer
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
