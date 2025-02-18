import axios from 'axios';
import * as dotenv from 'dotenv';
import { ensure } from '../../utils/utils';

dotenv.config({ path: '.env' });

const restApiUrl = process.env.REST_API_URL;
if (!restApiUrl) {
  throw new Error("REST_API_URL is not defined in the environment variables.");
}

/**
 * Fetch tokens from all chains via REST API.
 * The `/chains` endpoint returns chain details including tokens.
 */
async function getTokens(): Promise<any[]> {
  const { data: chains } = await axios.get(`${restApiUrl}/chains`);
  let tokens: any[] = [];
  for (const chainKey in chains) {
    if (chains.hasOwnProperty(chainKey)) {
      tokens = tokens.concat(chains[chainKey].tokens);
    }
  }
  return tokens;
}

/**
 * Fetch gas fee options for a given source and destination token using the REST API.
 * @param sourceTokenAddress - The address of the source token.
 * @param destinationTokenAddress - The address of the destination token.
 * @param messenger - The messenger type (e.g., "ALLBRIDGE").
 * @returns The gas fee options object.
 */
async function getGasFeeOptions(
  sourceTokenAddress: string,
  destinationTokenAddress: string,
  messenger: string
): Promise<any> {
  const params = new URLSearchParams({
    sourceToken: sourceTokenAddress,
    destinationToken: destinationTokenAddress,
    messenger: messenger,
  });
  const { data } = await axios.get(`${restApiUrl}/gas/fee?${params.toString()}`);
  return data;
}

/**
 * Fetch the amount to be received for a given transfer using the REST API.
 * @param amount - The amount to send (as a string).
 * @param sourceTokenAddress - The address of the source token.
 * @param destinationTokenAddress - The address of the destination token.
 * @returns The amount to be received (as a string).
 */
async function getAmountToBeReceived(
  amount: string,
  sourceTokenAddress: string,
  destinationTokenAddress: string
): Promise<string> {
  const params = new URLSearchParams({
    amount: amount,
    sourceToken: sourceTokenAddress,
    destinationToken: destinationTokenAddress,
  });
  const { data } = await axios.get(`${restApiUrl}/quote/amountToBeReceived?${params.toString()}`);
  // Assuming the API returns a JSON object like { result: "calculatedValue" }
  return data.result;
}

/**
 * Fetch the amount to send for a given transfer using the REST API.
 * @param amount - The desired amount to be received (as a string).
 * @param sourceTokenAddress - The address of the source token.
 * @param destinationTokenAddress - The address of the destination token.
 * @returns The amount to send (as a string).
 */
async function getAmountToSend(
  amount: string,
  sourceTokenAddress: string,
  destinationTokenAddress: string
): Promise<string> {
  const params = new URLSearchParams({
    amount: amount,
    sourceToken: sourceTokenAddress,
    destinationToken: destinationTokenAddress,
  });
  const { data } = await axios.get(`${restApiUrl}/quote/amountToSend?${params.toString()}`);
  // Assuming the API returns a JSON object like { result: "calculatedValue" }
  return data.result;
}

/**
 * Combines getAmountToBeReceived and getGasFeeOptions into a single call.
 * @param amount - The amount to send.
 * @param sourceTokenAddress - The address of the source token.
 * @param destinationTokenAddress - The address of the destination token.
 * @param messenger - The messenger type (e.g., "ALLBRIDGE").
 * @returns An object containing amountToSendFloat, amountToBeReceivedFloat, and gasFeeOptions.
 */
async function getAmountToBeReceivedAndGasFeeOptions(
  amount: string,
  sourceTokenAddress: string,
  destinationTokenAddress: string,
  messenger: string
): Promise<{ amountToSendFloat: string; amountToBeReceivedFloat: string; gasFeeOptions: any }> {
  const amountToBeReceived = await getAmountToBeReceived(amount, sourceTokenAddress, destinationTokenAddress);
  const amountToSend = await getAmountToSend(amount, sourceTokenAddress, destinationTokenAddress);
  const gasFeeOptions = await getGasFeeOptions(sourceTokenAddress, destinationTokenAddress, messenger);
  return {
    amountToSendFloat: amountToSend,
    amountToBeReceivedFloat: amountToBeReceived,
    gasFeeOptions: gasFeeOptions,
  };
}

/**
 * Combines getAmountToSend and getGasFeeOptions into a single call.
 * @param amount - The desired amount to be received.
 * @param sourceTokenAddress - The address of the source token.
 * @param destinationTokenAddress - The address of the destination token.
 * @param messenger - The messenger type (e.g., "ALLBRIDGE").
 * @returns An object containing amountToSendFloat, amountToBeReceivedFloat, and gasFeeOptions.
 */
async function getAmountToSendAndGasFeeOptions(
  amount: string,
  sourceTokenAddress: string,
  destinationTokenAddress: string,
  messenger: string
): Promise<{ amountToSendFloat: string; amountToBeReceivedFloat: string; gasFeeOptions: any }> {
  // This implementation is similar to getAmountToBeReceivedAndGasFeeOptions
  const amountToSend = await getAmountToSend(amount, sourceTokenAddress, destinationTokenAddress);
  const amountToBeReceived = await getAmountToBeReceived(amount, sourceTokenAddress, destinationTokenAddress);
  const gasFeeOptions = await getGasFeeOptions(sourceTokenAddress, destinationTokenAddress, messenger);
  return {
    amountToSendFloat: amountToSend,
    amountToBeReceivedFloat: amountToBeReceived,
    gasFeeOptions: gasFeeOptions,
  };
}

/**
 * Example: Calculate amounts using separate REST API calls.
 */
async function runExampleCalculateAmounts() {
  // Fetch tokens from REST API
  const tokens = await getTokens();
  // Find the source token: chain "POL" and symbol "USDC"
  const sourceToken = ensure(tokens.find((token) => token.chainSymbol === "POL" && token.symbol === "USDC"));
  // Find the destination token: chain "TRX" and symbol "USDT"
  const destinationToken = ensure(tokens.find((token) => token.chainSymbol === "TRX" && token.symbol === "USDT"));

  const amount = "100.5";
  const sourceChainMinUnit = "wei";

  // Get gas fee options
  const gasFeeOptions = await getGasFeeOptions(
    sourceToken.tokenAddress,
    destinationToken.tokenAddress,
    "ALLBRIDGE"
  );

  // Get the amount to be received
  const amountToBeReceived = await getAmountToBeReceived(
    amount,
    sourceToken.tokenAddress,
    destinationToken.tokenAddress
  );
  console.log(
    "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
    amount,
    sourceToken.symbol,
    gasFeeOptions.native.int,
    sourceChainMinUnit,
    sourceToken.chainSymbol,
    amountToBeReceived,
    destinationToken.symbol,
    destinationToken.chainSymbol
  );
  if (gasFeeOptions.stablecoin) {
    // Option to pay with stablecoins is available
    const floatGasFeeAmount = gasFeeOptions.stablecoin.float;
    console.log(
      "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
      amount,
      sourceToken.symbol,
      floatGasFeeAmount,
      sourceToken.symbol,
      sourceToken.chainSymbol,
      amountToBeReceived,
      destinationToken.symbol,
      destinationToken.chainSymbol
    );
  }

  // Get the amount to send
  const amountToSend = await getAmountToSend(
    amount,
    sourceToken.tokenAddress,
    destinationToken.tokenAddress
  );
  console.log(
    "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
    amountToSend,
    sourceToken.symbol,
    gasFeeOptions.native.int,
    sourceChainMinUnit,
    sourceToken.chainSymbol,
    amount,
    destinationToken.symbol,
    destinationToken.chainSymbol
  );
  if (gasFeeOptions.stablecoin) {
    // Option to pay with stablecoins is available
    const floatGasFeeAmount = gasFeeOptions.stablecoin.float;
    console.log(
      "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
      amountToSend,
      sourceToken.symbol,
      floatGasFeeAmount,
      sourceToken.symbol,
      sourceToken.chainSymbol,
      amount,
      destinationToken.symbol,
      destinationToken.chainSymbol
    );
  }
}

/**
 * Example: Get the amount to be received and gas fee options combined using the REST API.
 */
async function runExampleGetAmountToBeReceivedAndGasFeeOptions() {
  // Fetch tokens from REST API
  const tokens = await getTokens();
  // Find the source token: chain "POL" and symbol "USDC"
  const sourceToken = ensure(tokens.find((token) => token.chainSymbol === "POL" && token.symbol === "USDC"));
  // Find the destination token: chain "TRX" and symbol "USDT"
  const destinationToken = ensure(tokens.find((token) => token.chainSymbol === "TRX" && token.symbol === "USDT"));

  const amount = "100.5";
  const sourceChainMinUnit = "wei";

  // Get combined amount to be received and gas fee options
  const { amountToSendFloat, amountToBeReceivedFloat, gasFeeOptions } = await getAmountToBeReceivedAndGasFeeOptions(
    amount,
    sourceToken.tokenAddress,
    destinationToken.tokenAddress,
    "ALLBRIDGE"
  );
  console.log(
    "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
    amountToSendFloat,
    sourceToken.symbol,
    gasFeeOptions.native.int,
    sourceChainMinUnit,
    sourceToken.chainSymbol,
    amountToBeReceivedFloat,
    destinationToken.symbol,
    destinationToken.chainSymbol
  );
  if (gasFeeOptions.stablecoin) {
    // Option to pay with stablecoins is available
    const floatGasFeeAmount = gasFeeOptions.stablecoin.float;
    console.log(
      "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
      amount,
      sourceToken.symbol,
      floatGasFeeAmount,
      sourceToken.symbol,
      sourceToken.chainSymbol,
      amountToBeReceivedFloat,
      destinationToken.symbol,
      destinationToken.chainSymbol
    );
  }
}

/**
 * Example: Get the amount to send and gas fee options combined using the REST API.
 */
async function runExampleGetAmountToSendAndGasFeeOptions() {
  // Fetch tokens from REST API
  const tokens = await getTokens();
  // Find the source token: chain "POL" and symbol "USDC"
  const sourceToken = ensure(tokens.find((token) => token.chainSymbol === "POL" && token.symbol === "USDC"));
  // Find the destination token: chain "TRX" and symbol "USDT"
  const destinationToken = ensure(tokens.find((token) => token.chainSymbol === "TRX" && token.symbol === "USDT"));

  const amount = "100.5";
  const sourceChainMinUnit = "wei";

  // Get combined amount to send and gas fee options
  const { amountToSendFloat, amountToBeReceivedFloat, gasFeeOptions } = await getAmountToSendAndGasFeeOptions(
    amount,
    sourceToken.tokenAddress,
    destinationToken.tokenAddress,
    "ALLBRIDGE"
  );
  console.log(
    "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
    amountToSendFloat,
    sourceToken.symbol,
    gasFeeOptions.native.int,
    sourceChainMinUnit,
    sourceToken.chainSymbol,
    amountToBeReceivedFloat,
    destinationToken.symbol,
    destinationToken.chainSymbol
  );
  if (gasFeeOptions.stablecoin) {
    // Option to pay with stablecoins is available
    const floatGasFeeAmount = gasFeeOptions.stablecoin.float;
    console.log(
      "Send %s %s and %s %s (gas fee) on %s to receive %s %s on %s",
      amountToSendFloat,
      sourceToken.symbol,
      floatGasFeeAmount,
      sourceToken.symbol,
      sourceToken.chainSymbol,
      amountToBeReceivedFloat,
      destinationToken.symbol,
      destinationToken.chainSymbol
    );
  }
}

// Run all examples
runExampleCalculateAmounts()
  .then(() => {
    console.log("Done runExampleCalculateAmounts");
  })
  .catch((e) => {
    console.error(e);
  });

runExampleGetAmountToBeReceivedAndGasFeeOptions()
  .then(() => {
    console.log("Done runExampleGetAmountToBeReceivedAndGasFeeOptions");
  })
  .catch((e) => {
    console.error(e);
  });

runExampleGetAmountToSendAndGasFeeOptions()
  .then(() => {
    console.log("Done runExampleGetAmountToSendAndGasFeeOptions");
  })
  .catch((e) => {
    console.error(e);
  });
