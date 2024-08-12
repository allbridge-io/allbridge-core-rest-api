import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import solanaWeb3, { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

dotenv.config({ path: '.env' });

const fromAddress = getEnvVar('SOL_ACCOUNT_ADDRESS');
const privateKey = getEnvVar('SOL_PRIVATE_KEY');
const toAddressEth = getEnvVar('ETH_ACCOUNT_ADDRESS');
const solNodeRPCUrl = getEnvVar('SOL_PROVIDER_URL');

const exampleViaWormhole = async () => {
  const baseUrl = getEnvVar('REST_API_URL');

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['SOL'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );

  const destinationChainEth = chains['ETH'];
  const destinationTokenInfoEth = ensure(
    destinationChainEth.tokens.find(
      (tokenInfo: any) => tokenInfo.symbol === 'USDT',
    ),
  );
  const amountInt = parseFloat('0.2') * 10 ** sourceTokenInfo.decimals;

  // initiate transfer using Messenger.WORMHOLE
  const raw = (
    await axios.get(
      `${baseUrl}/raw/bridge?amount=${amountInt}` +
        `&sender=${fromAddress}` +
        `&recipient=${toAddressEth}` +
        `&sourceToken=${sourceTokenInfo.tokenAddress}` +
        `&destinationToken=${destinationTokenInfoEth.tokenAddress}` +
        `&messenger=WORMHOLE` +
        `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
    )
  ).data;

  const keypair = solanaWeb3.Keypair.fromSecretKey(bs58.decode(privateKey));
  const transaction = VersionedTransaction.deserialize(Buffer.from(raw, 'hex'));
  transaction.sign([keypair]);
  const connection = new solanaWeb3.Connection(solNodeRPCUrl, 'confirmed');
  const txid = await connection.sendTransaction(transaction);
  console.log(`https://explorer.solana.com/tx/${txid}`);
};

const exampleViaAllbridge = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['SOL'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC'),
  );

  const destinationChainEth = chains['ETH'];
  const destinationTokenInfoEth = ensure(
    destinationChainEth.tokens.find(
      (tokenInfo: any) => tokenInfo.symbol === 'USDT',
    ),
  );
  const amountInt = parseFloat('0.3') * 10 ** sourceTokenInfo.decimals;

  // initiate transfer using Messenger.ALLBRIDGE
  const raw = (
    await axios.get(
      `${baseUrl}/raw/bridge?amount=${amountInt}` +
        `&sender=${fromAddress}` +
        `&recipient=${toAddressEth}` +
        `&sourceToken=${sourceTokenInfo.tokenAddress}` +
        `&destinationToken=${destinationTokenInfoEth.tokenAddress}` +
        `&messenger=ALLBRIDGE` +
        `&feePaymentMethod=WITH_NATIVE_CURRENCY`,
    )
  ).data;

  const keypair = solanaWeb3.Keypair.fromSecretKey(bs58.decode(privateKey));
  const transaction = VersionedTransaction.deserialize(Buffer.from(raw, 'hex'));
  transaction.sign([keypair]);
  const connection = new solanaWeb3.Connection(solNodeRPCUrl, 'confirmed');
  const txid = await connection.sendTransaction(transaction);
  console.log(`https://explorer.solana.com/tx/${txid}`);
};

exampleViaWormhole()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
exampleViaAllbridge()
  .then(() => {
    console.log('Done');
  })
  .catch((e) => {
    console.error(e);
  });
