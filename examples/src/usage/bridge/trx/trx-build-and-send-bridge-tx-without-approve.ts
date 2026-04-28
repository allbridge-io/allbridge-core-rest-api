import axios from 'axios';
import * as dotenv from 'dotenv';
import { TronWeb } from 'tronweb';
import { getEnvVar } from '../../../utils/env';
import { sendTrxRawTransaction } from '../../../utils/tronWeb';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const providerUrl = getEnvVar("TRONWEB_PROVIDER_URL");
const accountAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
const toAccountAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
const privateKey = getEnvVar("TRX_PRIVATE_KEY");
const restApiUrl = getEnvVar("REST_API_URL");

const tronWeb = new TronWeb(providerUrl, providerUrl, providerUrl, privateKey);

const main = async () => {
  try {
    const chainsResponse = await axios.get(`${restApiUrl}/chains`);
    const chains = chainsResponse.data;

    const sourceChain = chains['ETH'];
    const destinationChain = chains['TRX'];

    const sourceTokenInfo = ensure(
      sourceChain.tokens.find((tokenInfo: {symbol: string}) => tokenInfo.symbol === "USDT")
    );

    const destinationTokenInfo = ensure(
      destinationChain.tokens.find((tokenInfo: {symbol: string}) => tokenInfo.symbol === "USDT")
    );

    const transferParams = new URLSearchParams({
      amount: "0.7",
      fromAccountAddress: accountAddress,
      toAccountAddress: toAccountAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
    });
    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log(`Requesting bridge transaction from: ${transferUrl}`);

    const { data: rawBridgeTx } = await axios.get(transferUrl);

    const response = await sendTrxRawTransaction(tronWeb, rawBridgeTx);
    console.log("Tron send response:", response);
  } catch (error) {
    console.error("Error during execution:", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
