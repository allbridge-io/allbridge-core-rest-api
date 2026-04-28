import { Keypair, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const exampleSignedTransactionXdr =
  'AAAAAwAAAADXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const main = async () => {
  const restApiUrl = getEnvVar('REST_API_URL');
  const sender = getEnvVar('SRB_ACCOUNT_ADDRESS');
  const recipient = getEnvVar('ETH_ACCOUNT_ADDRESS');
  const privateKey = getEnvVar('SRB_PRIVATE_KEY');
  const networkPassphrase = getEnvVar('SRB_NETWORK_PASSPHRASE');

  const chains = (await axios.get(`${restApiUrl}/chains`)).data;
  const sourceToken = ensure(
    chains['SRB'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
  );
  const destinationToken = ensure(
    chains['ETH'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDT'),
  );

  const rawBridgeRequestParams = new URLSearchParams({
    amount: toBaseUnits('0.01', sourceToken.decimals),
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    messenger: 'ALLBRIDGE',
    feePaymentMethod: 'WITH_NATIVE_CURRENCY',
  });

  console.log('Requesting Soroban raw bridge transaction with params:', {
    sender,
    recipient,
    sourceToken: sourceToken.tokenAddress,
    destinationToken: destinationToken.tokenAddress,
    amount: rawBridgeRequestParams.get('amount'),
  });
  const { data: rawBridgeXdr } = await axios.get(
    `${restApiUrl}/raw/bridge?${rawBridgeRequestParams.toString()}`,
  );

  const signedTransaction = TransactionBuilder.fromXDR(
    rawBridgeXdr,
    networkPassphrase,
  ) as Transaction;
  signedTransaction.sign(Keypair.fromSecret(privateKey));
  const signedTransactionXdr = signedTransaction.toXDR();

  const restoreRequestParams = new URLSearchParams({
    xdrTx: signedTransactionXdr,
    sender,
  });

  console.log('Building Soroban restore transaction with params:', {
    sender,
    signedTransactionXdr,
    expectedSignedTransactionXdrShape: exampleSignedTransactionXdr,
  });

  const { data } = await axios.get(
    `${restApiUrl}/raw/stellar/restore/?${restoreRequestParams.toString()}`,
  );

  console.log('Soroban restore XDR:', data);
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
