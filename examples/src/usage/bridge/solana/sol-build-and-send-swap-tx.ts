import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { sendSolanaRawTransaction } from '../../../utils/solanaWeb';
import { toBaseUnits } from '../../../utils/amount';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const fromAddress = getEnvVar('SOL_ACCOUNT_ADDRESS');
  const privateKey = getEnvVar('SOL_PRIVATE_KEY');
  const toAddress = getEnvVar('SOL_ACCOUNT_ADDRESS');
  const solNodeRPCUrl = getEnvVar('SOL_PROVIDER_URL');

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

  const getMinimumReceiveAmount = async (amountInt: string, sourceToken: any, destinationToken: any) => {
    const response = await axios.get(
      `${baseUrl}/swap/details` +
      `?sourceToken=${sourceToken}` +
      `&destinationToken=${destinationToken}` +
      `&amount=${amountInt}`
    );
    return toBaseUnits(
      response.data.amountReceivedInFloat,
      destinationTokenInfo.decimals,
    );
  };

  const swapTokens = async (messenger: string, amountStr: string) => {
    const amountInt = toBaseUnits(amountStr, sourceTokenInfo.decimals);
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

    const txid = await sendSolanaRawTransaction(
      rawTxHex,
      privateKey,
      solNodeRPCUrl,
    );

    console.log(`Transaction submitted: https://explorer.solana.com/tx/${txid}`);
  };

  await swapTokens('WORMHOLE', '10');
  await swapTokens('ALLBRIDGE', '10');
};

main()
.then(() => console.log('Done'))
.catch((e) => console.error(e));
