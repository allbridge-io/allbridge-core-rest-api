import Big from 'big.js';
import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  rpc as SorobanRpc,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import axios from 'axios';
import { ensure } from '../../../utils/utils';
import { getEnvVar } from '../../../utils/env';
import { toBaseUnits } from '../../../utils/amount';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const fromAddress = getEnvVar('SRB_ACCOUNT_ADDRESS');
const privateKey = getEnvVar('SRB_PRIVATE_KEY');
const sorobanNetworkPassphrase = getEnvVar('SRB_NETWORK_PASSPHRASE');
const toAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const FEE = 100;
const SEND_TRANSACTION_TIMEOUT = 180;

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const chains = (await axios.get(`${baseUrl}/chains`)).data;
  const server = new SorobanRpc.Server(getEnvVar('SRB_NODE_URL'));

  const sourceToken = ensure(
    chains['SRB'].tokens.find((t: any) => t.symbol == 'YARO'),
  );
  const destinationToken = ensure(
    chains['SPL'].tokens.find((t: any) => t.symbol == 'YARO'),
  );
  const amountStr = '1';
  const amount = toBaseUnits(amountStr, sourceToken.decimals);
  console.log(
    `Sending ${amountStr} ${sourceToken.symbol} to ${toAddress} on BSC. `,
  );
  const xdrTx: string = (
    await axios.get(
      `${baseUrl}/raw/bridge?amount=${amount}` +
        `&sender=${fromAddress}` +
        `&recipient=${toAddress}` +
        `&sourceToken=${sourceToken.tokenAddress}` +
        `&destinationToken=${destinationToken.tokenAddress}` +
        `&messenger=ALLBRIDGE` +
        `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
    )
  ).data;

  const srbKeypair = Keypair.fromSecret(privateKey);
  const transaction = TransactionBuilder.fromXDR(
    xdrTx,
    sorobanNetworkPassphrase,
  );
  transaction.sign(srbKeypair);
  const signedTx = transaction.toXDR();

  try {
    console.log(signedTx);
    const restoreXdrResp = await axios.get(
      `${baseUrl}/raw/stellar/restore?xdrTx=${signedTx}` +
        `&sender=${fromAddress}`,
    );
    console.log(restoreXdrResp);
    if (restoreXdrResp.status == 200 && restoreXdrResp.data) {
      const restoreXdrTx = TransactionBuilder.fromXDR(
        restoreXdrResp.data,
        sorobanNetworkPassphrase,
      ) as Transaction;
      restoreXdrTx.sign(srbKeypair);
      const signedRestoreXdrTx = restoreXdrTx.toXDR();
      const transaction = TransactionBuilder.fromXDR(
        signedRestoreXdrTx,
        sorobanNetworkPassphrase,
      ) as Transaction;
      const sentRestoreXdrTx = await server.sendTransaction(transaction);

      let confirmRestoreXdrTx;
      let counter = 10;
      while (counter > 0) {
        const getTransactionResponse = await server.getTransaction(
          sentRestoreXdrTx.hash,
        );
        confirmRestoreXdrTx = getTransactionResponse;
        if (
          getTransactionResponse.status ===
            SorobanRpc.Api.GetTransactionStatus.FAILED ||
          getTransactionResponse.status ===
            SorobanRpc.Api.GetTransactionStatus.SUCCESS
        ) {
          break;
        }
        counter--;
      }
      if (
        !!confirmRestoreXdrTx &&
        confirmRestoreXdrTx.status ===
          SorobanRpc.Api.GetTransactionStatus.NOT_FOUND
      ) {
        console.log(
          `Waited for Restore transaction to complete, but it did not. ` +
            `Check the transaction status manually. ` +
            `Hash: ${sentRestoreXdrTx.hash}`,
        );
      } else if (
        !!confirmRestoreXdrTx &&
        confirmRestoreXdrTx.status ===
          SorobanRpc.Api.GetTransactionStatus.FAILED
      ) {
        console.log(
          `Transaction Restore failed. Check the transaction manually.` +
            `Hash: ${sentRestoreXdrTx.hash}`,
        );
      } else {
        console.log(
          `Transaction Restore Confirmed. Hash: ${sentRestoreXdrTx.hash}`,
        );
      }
    }
  } catch (e) {
    console.error(e);
  }

  const tx = TransactionBuilder.fromXDR(
    signedTx,
    sorobanNetworkPassphrase,
  ) as Transaction;
  console.log(tx.toXDR());
  const sent = await server.sendTransaction(tx);

  let confirm;
  let counter = 10;
  while (counter > 0) {
    const getTransactionResponse = await server.getTransaction(sent.hash);
    confirm = getTransactionResponse;
    if (
      getTransactionResponse.status ===
        SorobanRpc.Api.GetTransactionStatus.FAILED ||
      getTransactionResponse.status ===
        SorobanRpc.Api.GetTransactionStatus.SUCCESS
    ) {
      break;
    }
    counter--;
  }
  if (
    !!confirm &&
    confirm.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND
  ) {
    console.log(
      `Waited for transaction to complete, but it did not. ` +
        `Check the transaction status manually. ` +
        `Hash: ${sent.hash}`,
    );
  } else if (
    !!confirm &&
    confirm.status === SorobanRpc.Api.GetTransactionStatus.FAILED
  ) {
    console.log(
      `Transaction failed. Check the transaction manually.` +
        `Hash: ${sent.hash}`,
    );
  } else {
    console.log(`Transaction Confirmed. Hash: ${sent.hash}`);
  }

  const destinationTokenSRB = sourceToken;

  const balanceLine = (
    await axios.get(
      `${baseUrl}/check/stellar/balanceline?` +
        `token=${destinationTokenSRB.tokenAddress}` +
        `&address=${fromAddress}`,
    )
  ).data;
  console.log(`BalanceLine:`, balanceLine);
  const notEnoughBalanceLine =
    !balanceLine ||
    Big(balanceLine.balance).add(Big(amount)).gt(Big(balanceLine.limit));
  if (notEnoughBalanceLine) {
    const stellar = new Horizon.Server(getEnvVar('STLR_NODE_URL'));
    const stellarAccount = await stellar.loadAccount(fromAddress);
    const [symbol, srbTokenAddress] = sourceToken.originTokenAddress.split(':');

    const asset = new Asset(symbol, srbTokenAddress);
    const changeTrust = Operation.changeTrust({
      asset: asset,
      limit: '1000000',
    });

    const transaction = new TransactionBuilder(stellarAccount, {
      fee: FEE.toString(10),
      networkPassphrase: sorobanNetworkPassphrase,
    })
      .addOperation(changeTrust)
      .setTimeout(SEND_TRANSACTION_TIMEOUT)
      .build();

    transaction.sign(srbKeypair);
    const submit = await stellar.submitTransaction(transaction);
    console.log('Submitted change trust tx. Hash:', submit.hash);
  }
};

main()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
