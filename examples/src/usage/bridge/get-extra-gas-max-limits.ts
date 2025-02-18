import axios from 'axios';
import * as dotenv from 'dotenv';
import { ensure } from '../../utils/utils';

dotenv.config({ path: '.env' });

const restApiUrl = process.env.REST_API_URL;
if (!restApiUrl) {
  throw new Error('REST_API_URL is not defined in environment variables.');
}

/**
 * Retrieves the chain details map from the REST API.
 * The `/chains` endpoint returns an object where each key is a chain symbol (e.g., "POL", "TRX")
 * and each value contains details including the list of tokens.
 *
 * @returns A Promise that resolves to the chain details map.
 */
async function getChainDetailsMap(): Promise<any> {
  const { data } = await axios.get(`${restApiUrl}/chains`);
  return data;
}

/**
 * Retrieves the maximum extra gas limits for a given source and destination token.
 * It calls the `/gas/extra/limits` endpoint with the required query parameters:
 * - sourceToken: the token address on the source chain.
 * - destinationToken: the token address on the destination chain.
 *
 * @param sourceTokenAddress - The address of the source token.
 * @param destinationTokenAddress - The address of the destination token.
 * @returns A Promise that resolves to the extra gas limits.
 */
async function getExtraGasMaxLimits(
  sourceTokenAddress: string,
  destinationTokenAddress: string,
): Promise<any> {
  const params = new URLSearchParams({
    sourceToken: sourceTokenAddress,
    destinationToken: destinationTokenAddress,
  });
  const { data } = await axios.get(`${restApiUrl}/gas/extra/limits?${params.toString()}`);
  return data;
}

async function main() {
  try {
    // Retrieve chain details from the REST API.
    const chainDetailsMap = await getChainDetailsMap();

    // Filter for the source token (USDC on the POL chain)
    const sourceChain = chainDetailsMap['POL'];
    const sourceToken = ensure(
      sourceChain.tokens.find((token: any) => token.symbol === 'USDC')
    );

    // Filter for the destination token (USDT on the TRX chain)
    const destChain = chainDetailsMap['TRX'];
    const destToken = ensure(
      destChain.tokens.find((token: any) => token.symbol === 'USDT')
    );

    // Retrieve the extra gas maximum limits using the tokens' addresses.
    const extraGasMax = await getExtraGasMaxLimits(sourceToken.tokenAddress, destToken.tokenAddress);
    console.log("extraGas Limits =", JSON.stringify(extraGasMax, null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
