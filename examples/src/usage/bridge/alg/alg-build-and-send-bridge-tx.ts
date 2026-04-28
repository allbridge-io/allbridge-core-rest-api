import * as dotenv from 'dotenv';
import axios from 'axios';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import { sendAlgRawTransaction } from '../../../utils/alg';
import { toBaseUnits } from '../../../utils/amount';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');

  const fromAddress = getEnvVar("ALG_ACCOUNT_ADDRESS");
  const toAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['ALG'];
  const sourceTokenInfo = ensure(
    sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC')
  );

  const destinationChain = chains['ETH'];
  const destinationTokenInfo = ensure(
    destinationChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === 'USDC')
  );

  const amountStr = "10.15";
  const amountInt = toBaseUnits(amountStr, sourceTokenInfo.decimals);

  console.log(`Requesting raw transaction to bridge ${amountStr} ${sourceTokenInfo.symbol}...`);

  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/bridge?amount=${amountInt}` +
    `&sender=${fromAddress}` +
    `&recipient=${toAddress}` +
    `&sourceToken=${sourceTokenInfo.tokenAddress}` +
    `&destinationToken=${destinationTokenInfo.tokenAddress}` +
    `&messenger=ALLBRIDGE` +
    `&feePaymentMethod=WITH_STABLECOIN`
  );


  const txId = await sendAlgRawTransaction(rawTransactionTransfer.data);
  console.log("tx id:", txId);
};

main()
.then(() => {
  console.log("Done");
})
.catch((e) => {
  console.error(e);
});
