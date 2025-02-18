import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import { TronWeb } from 'tronweb';
import { Transaction as TronWebTransaction } from 'tronweb/src/types/Transaction';

dotenv.config({ path: '.env' });

// Environment variables
const fromAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
const toAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
const tronProviderUrl = getEnvVar("TRONWEB_PROVIDER_URL");
const trxPrivateKey = getEnvVar("TRX_PRIVATE_KEY");
const restApiUrl = getEnvVar("REST_API_URL");

// Initialize TronWeb instance using the same URL for fullNode, solidityNode, and eventServer
const tronWeb = new TronWeb(
  tronProviderUrl,
  tronProviderUrl,
  tronProviderUrl,
  trxPrivateKey
);

/**
 * Helper function to sign and broadcast a raw transaction on the Tron network.
 * @param tronWeb - TronWeb instance.
 * @param rawTransaction - The raw transaction (as provided by the REST API) to be signed and sent.
 * @returns The transaction receipt.
 */
async function sendRawTransaction(tronWeb: TronWeb, rawTransaction: TronWebTransaction): Promise<any> {
  // Sign the raw transaction (casting to TronWebTransaction)
  const signedTx = await tronWeb.trx.sign(rawTransaction as TronWebTransaction);
  if (!signedTx.signature) {
    throw new Error("Transaction was not signed properly");
  }
  // Broadcast the signed transaction
  return await tronWeb.trx.sendRawTransaction(signedTx);
}

const main = async () => {
  try {
    // Fetch chain details from REST API
    const chainsResponse = await axios.get(`${restApiUrl}/chains`);
    const chains = chainsResponse.data;

    // Retrieve the source token information for TRX chain (e.g. USDT)
    const sourceChain = chains['TRX'];
    const sourceTokenInfo = ensure(
      sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDT")
    );

    // Retrieve the destination token information for ETH chain (e.g. USDC)
    const destinationChain = chains['ETH'];
    const destinationTokenInfo = ensure(
      destinationChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDC")
    );

    // Approve the bridge contract to transfer tokens from the sender's address.
    const approvalParams = new URLSearchParams({
      owner: fromAddress,
      token: sourceTokenInfo.tokenAddress,
    });
    const approvalUrl = `${restApiUrl}/raw/approve?${approvalParams.toString()}`;
    console.log(`Requesting approval transaction from: ${approvalUrl}`);

    const { data: rawApprovalTx } = await axios.get(approvalUrl);

    // Sign and send the approval transaction on the Tron network.
    const approveReceipt = await sendRawTransaction(tronWeb, rawApprovalTx);
    console.log("Approval transaction receipt:", JSON.stringify(approveReceipt, null, 2));

    // Initiate the token transfer via the REST API.
    const transferParams = new URLSearchParams({
      amount: "17", // The amount is passed as a string;
      fromAccountAddress: fromAddress,
      toAccountAddress: toAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
      feePaymentMethod: "WITH_NATIVE_CURRENCY",
    });
    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log(`Requesting transfer transaction from: ${transferUrl}`);

    const { data: rawTransferTx } = await axios.get(transferUrl);

    // Sign and send the transfer transaction
    const transferReceipt = await sendRawTransaction(tronWeb, rawTransferTx);
    console.log("Transfer transaction receipt:", transferReceipt);
  } catch (error) {
    console.error("Error during execution:", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
