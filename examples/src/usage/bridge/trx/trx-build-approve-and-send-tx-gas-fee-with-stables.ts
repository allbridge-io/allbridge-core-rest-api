import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { ensure } from '../../../utils/utils';
import { TronWeb } from 'tronweb';
import { Transaction as TronWebTransaction } from 'tronweb/src/types/Transaction';
import Big from 'big.js';

dotenv.config({ path: '.env' });

// Load environment variables
const fromAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
const toAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
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
 * Signs and broadcasts a raw transaction on the Tron network.
 * @param tronWeb - TronWeb instance.
 * @param rawTransaction - The raw transaction (as returned by the REST API).
 * @returns The transaction receipt.
 */
async function sendRawTransaction(tronWeb: TronWeb, rawTransaction: TronWebTransaction): Promise<any> {
  // Sign the raw transaction (assume it is compatible with TronWebTransaction)
  const signedTx = await tronWeb.trx.sign(rawTransaction as TronWebTransaction);
  if (!signedTx.signature) {
    throw new Error("Transaction was not signed properly");
  }
  // Broadcast the signed transaction
  return await tronWeb.trx.sendRawTransaction(signedTx);
}

/**
 * Main function demonstrating:
 * 1. Retrieving chain/token details via REST API.
 * 2. Approving the bridge to spend tokens.
 * 3. Fetching gas fee options.
 * 4. Initiating a token transfer (including gas fee) via REST API.
 * 5. Signing and sending the transactions via TronWeb.
 */
const main = async () => {
  try {
    // Fetch chain details
    const chainsResponse = await axios.get(`${restApiUrl}/chains`);
    const chains = chainsResponse.data;

    // Retrieve source token info for TRX chain (e.g. USDT)
    const sourceChain = chains['TRX'];
    const sourceTokenInfo = ensure(
      sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDT")
    );

    // Retrieve destination token info for ETH chain (e.g. USDT)
    const destinationChain = chains['ETH'];
    const destinationTokenInfo = ensure(
      destinationChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDT")
    );

    // Approve the bridge contract
    const approveParams = new URLSearchParams({
      owner: fromAddress,
      token: sourceTokenInfo.tokenAddress,
    });
    const approveUrl = `${restApiUrl}/raw/approve?${approveParams.toString()}`;
    console.log(`Requesting approval transaction from: ${approveUrl}`);
    const { data: rawApprovalTx } = await axios.get(approveUrl);
    const approveReceipt = await sendRawTransaction(tronWeb, rawApprovalTx);
    console.log("Approval transaction receipt:", JSON.stringify(approveReceipt, null, 2));

    // Retrieve gas fee options
    const feeParams = new URLSearchParams({
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
    });
    const feeUrl = `${restApiUrl}/gas/fee?${feeParams.toString()}`;
    const { data: gasFeeOptions } = await axios.get(feeUrl);
    console.log("Gas fee options:", gasFeeOptions);

    // Select the fee option for WITH_STABLECOIN.
    const gasFeeOption = ensure(gasFeeOptions["WITH_STABLECOIN"]);
    const gasFeeAmountFloat = gasFeeOption.float;
    const gasFeeAmountInt = gasFeeOption.int;

    // --- Calculate total amount to send ---
    const amountToSendFloat = "17";
    const totalAmountFloat = new Big(amountToSendFloat).plus(gasFeeAmountFloat).toFixed();
    console.log(
      `Sending ${amountToSendFloat} ${sourceTokenInfo.symbol} (gas fee ${gasFeeAmountFloat} ${sourceTokenInfo.symbol}). Total amount: ${totalAmountFloat} ${sourceTokenInfo.symbol}`
    );

    // --- Initiate the transfer ---
    // Build query parameters for the transfer transaction.
    const transferParams = new URLSearchParams({
      amount: totalAmountFloat,
      fromAccountAddress: fromAddress,
      toAccountAddress: toAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
      gasFeePaymentMethod: "WITH_STABLECOIN",
      fee: gasFeeAmountInt,
    });
    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log(`Requesting transfer transaction from: ${transferUrl}`);
    const { data: rawTransferTx } = await axios.get(transferUrl);
    const transferReceipt = await sendRawTransaction(tronWeb, rawTransferTx);
    console.log("Transfer transaction receipt:", transferReceipt);
  } catch (error) {
    console.error("Error during execution:", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
