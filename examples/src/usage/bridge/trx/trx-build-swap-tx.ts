import axios from 'axios';
import * as dotenv from 'dotenv';
import { TronWeb } from 'tronweb';
import { Transaction as TronWebTransaction } from 'tronweb/src/types/Transaction';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

// Load environment variables
const fromAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
// In this example, the recipient address is the same as the sender's address,
// but you can replace it with another address if needed.
const toAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
const tronProviderUrl = getEnvVar("TRONWEB_PROVIDER_URL");
const trxPrivateKey = getEnvVar("TRX_PRIVATE_KEY");
const restApiUrl = getEnvVar("REST_API_URL");

// Initialize TronWeb (using the same URL for fullNode, solidityNode, and eventServer)
const tronWeb = new TronWeb(
  tronProviderUrl,
  tronProviderUrl,
  tronProviderUrl,
  trxPrivateKey
);

/**
 * Function to sign and broadcast a raw transaction on the Tron network.
 * @param tronWeb - TronWeb instance.
 * @param rawTransaction - The raw transaction object (as returned by the REST API).
 * @returns The transaction result.
 */
async function sendRawTransaction(tronWeb: TronWeb, rawTransaction: TronWebTransaction): Promise<any> {
  const signedTx = await tronWeb.trx.sign(rawTransaction as TronWebTransaction);
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

    // 2. Retrieve token information for USDC on the TRX chain
    const sourceChain = chains['TRX'];
    const sourceTokenInfo = ensure(
      sourceChain.tokens.find((token: any) => token.symbol === "USDC")
    );

    const destinationChain = chains['TRX'];
    const destinationTokenInfo = ensure(
      destinationChain.tokens.find((token: any) => token.symbol === "USDC")
    );

    // Define the amount to transfer (as in the JS-SDK example - "10")
    const amount = "10";

    // 3. (Optional) Send an approval transaction if the token requires approval for spending.
    // Build the URL for the approval request.
    const approvalParams = new URLSearchParams({
      owner: fromAddress,
      token: sourceTokenInfo.tokenAddress,
    });
    const approvalUrl = `${restApiUrl}/raw/approve?${approvalParams.toString()}`;
    console.log(`Requesting approval transaction: ${approvalUrl}`);

    const { data: rawApprovalTx } = await axios.get(approvalUrl);
    const approvalReceipt = await sendRawTransaction(tronWeb, rawApprovalTx);
    console.log("Approval transaction result:", JSON.stringify(approvalReceipt, null, 2));

    // 4. Construct the request for the transfer using the REST API.
    // This uses parameters similar to the swapParams from the JS-SDK example.
    const transferParams = new URLSearchParams({
      amount: amount,
      fromAccountAddress: fromAddress,
      toAccountAddress: toAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
      feePaymentMethod: "WITH_NATIVE_CURRENCY", // or another fee payment method if needed
    });
    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log(`Requesting transfer transaction: ${transferUrl}`);

    const { data: rawTransferTx } = await axios.get(transferUrl);
    const transferReceipt = await sendRawTransaction(tronWeb, rawTransferTx);
    console.log("Transfer result (tx id):", transferReceipt.txid);
  } catch (error) {
    console.error("Error during execution:", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
