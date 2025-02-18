import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import solanaWeb3, { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  // sender address
  const fromAddress = getEnvVar('SOL_ACCOUNT_ADDRESS');
  const privateKey = getEnvVar('SOL_PRIVATE_KEY');
  const toAddress = getEnvVar('SOL_ACCOUNT_ADDRESS');
  const solNodeRPCUrl = getEnvVar('SOL_PROVIDER_URL');

  // Fetch supported chains
  console.log(`Fetching supported chains...`);
  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['SOL'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: { symbol: string; }) => tokenInfo.symbol === 'USDC')
  );

  const destinationChain = chains['SOL'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find((tokenInfo: { symbol: string; }) => tokenInfo.symbol === 'USDT')
  );

  const getMinimumReceiveAmount = async (amountInt: number, sourceToken: any, destinationToken: any) => {
    const response = await axios.get(
      `${baseUrl}/swap/details` +
      `?sourceToken=${sourceToken}` +
      `&destinationToken=${destinationToken}` +
      `&amount=${amountInt}`
    );
    return parseFloat(response.data.amountReceivedInFloat) * 10 ** destinationTokenInfo.decimals;
  };

  const swapTokens = async (messenger: string, amountStr: string) => {
    const amountInt = parseFloat(amountStr) * 10 ** sourceTokenInfo.decimals;
    const minimumReceiveAmount = await getMinimumReceiveAmount(amountInt, sourceTokenInfo.tokenAddress, destinationTokenInfo.tokenAddress);

    console.log(`Requesting raw swap transaction from API using ${messenger}...`);
    const rawTransactionTransfer = await axios.get(
      `${baseUrl}/raw/swap?amount=${amountInt}` +
      `&sender=${fromAddress}` +
      `&recipient=${toAddress}` +
      `&sourceToken=${sourceTokenInfo.tokenAddress}` +
      `&destinationToken=${destinationTokenInfo.tokenAddress}` +
      `&minimumReceiveAmount=${minimumReceiveAmount}`
    );

    const rawTxHex = rawTransactionTransfer.data;
    console.log(`Received raw transaction (truncated): ${rawTxHex.substring(0, 30)}...`);

    // Send transaction
    const keypair = solanaWeb3.Keypair.fromSecretKey(bs58.decode(privateKey));
    const txBuffer = Buffer.from(rawTxHex, 'hex');
    const transaction = VersionedTransaction.deserialize(txBuffer);
    transaction.sign([keypair]);

    const connection = new solanaWeb3.Connection(solNodeRPCUrl, 'confirmed');
    const txid = await connection.sendTransaction(transaction);

    console.log(`Transaction submitted: https://explorer.solana.com/tx/${txid}`);
  };

  await swapTokens('WORMHOLE', '10');
  await swapTokens('ALLBRIDGE', '10');
};

main()
.then(() => console.log('Done'))
.catch((e) => console.error(e));
