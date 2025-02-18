import axios from 'axios';
import * as dotenv from 'dotenv';
import { TronWeb } from 'tronweb';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

// Load environment variables
const providerUrl = getEnvVar("TRONWEB_PROVIDER_URL");
const accountAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
const toAccountAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
const privateKey = getEnvVar("TRX_PRIVATE_KEY");
const restApiUrl = getEnvVar("REST_API_URL");

// Initialize TronWeb (using the same URL for fullNode, solidityNode, and eventServer)
const tronWeb = new TronWeb(providerUrl, providerUrl, providerUrl, privateKey);

/**
 * Function to sign and broadcast a raw transaction on the Tron network.
 * @param tronWeb - TronWeb instance.
 * @param rawTransaction - The raw transaction object as returned by the REST API.
 * @returns The transaction result.
 */
async function sendRawTransaction(tronWeb: TronWeb, rawTransaction: any): Promise<any> {
  // Sign the raw transaction
  const signedTx = await tronWeb.trx.sign(rawTransaction);
  if (!signedTx.signature) {
    throw new Error("Transaction was not signed properly");
  }
  // Broadcast the signed transaction to the Tron network
  return await tronWeb.trx.sendRawTransaction(signedTx);
}

const main = async () => {
  try {
    // 1. Fetch chain details using the REST API
    const chainsResponse = await axios.get(`${restApiUrl}/chains`);
    const chains = chainsResponse.data;

    // 2. Retrieve source chain details for ETH and destination chain details for TRX
    const sourceChain = chains['ETH'];
    const destinationChain = chains['TRX'];

    // 3. Find the source token on the ETH chain by matching the token address
    const sourceTokenInfo = ensure(
      sourceChain.tokens.find((tokenInfo: {symbol: string}) => tokenInfo.symbol === "USDT")
    );

    // 4. Find the destination token on the TRX chain by matching the token address
    const destinationTokenInfo = ensure(
      destinationChain.tokens.find((tokenInfo: {symbol: string}) => tokenInfo.symbol === "USDT")
    );

    // 5. Build the transfer parameters similar to the original SendParams
    const transferParams = new URLSearchParams({
      amount: "0.7",
      fromAccountAddress: accountAddress,
      toAccountAddress: toAccountAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
      // Optional fee parameter can be added here if needed, e.g.:
      // fee: "2000000000000000"
    });
    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log(`Requesting bridge transaction from: ${transferUrl}`);

    // 6. Request the raw bridge transaction from the REST API
    const { data: rawBridgeTx } = await axios.get(transferUrl);

    // 7. Sign and broadcast the raw bridge transaction using TronWeb
    const response = await sendRawTransaction(tronWeb, rawBridgeTx);
    console.log("Tron send response:", response);
  } catch (error) {
    console.error("Error during execution:", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
