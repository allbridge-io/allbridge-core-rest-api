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
  const toAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
  const solNodeRPCUrl = getEnvVar('SOL_PROVIDER_URL');

  console.log(`Fetching supported chains...`);
  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['SOL'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: { symbol: string; }) => tokenInfo.symbol === 'YARO')
  );

  const destinationChain = chains['SPL'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find((tokenInfo: { symbol: string; }) => tokenInfo.symbol === 'YARO')
  );

  const transferViaMessenger = async (messenger: string, amountStr: string) => {
    const amountInt = toBaseUnits(amountStr, sourceTokenInfo.decimals);
    console.log(`Requesting raw transaction from API using ${messenger}...`);
    const rawTransactionTransfer = await axios.get(
      `${baseUrl}/raw/bridge?amount=${amountInt}` +
        `&sender=${fromAddress}` +
        `&recipient=${toAddress}` +
        `&sourceToken=${sourceTokenInfo.tokenAddress}` +
        `&destinationToken=${destinationTokenInfo.tokenAddress}` +
        `&messenger=${messenger}` +
        `&feePaymentMethod=WITH_NATIVE_CURRENCY`
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

  await transferViaMessenger('WORMHOLE', '0.02');
  await transferViaMessenger('ALLBRIDGE', '0.03');
};

main()
  .then(() => console.log('Done'))
  .catch((e) => console.error(e));
