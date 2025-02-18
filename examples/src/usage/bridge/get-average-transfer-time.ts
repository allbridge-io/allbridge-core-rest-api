import axios from 'axios';
import * as dotenv from 'dotenv';
import { ensure } from '../../utils/utils';

dotenv.config({ path: '.env' });

const restApiUrl = process.env.REST_API_URL;
if (!restApiUrl) {
  throw new Error('REST_API_URL is not defined in environment variables.');
}

/**
 * Converts milliseconds to a formatted time string (HH:MM:SS.mmm).
 * @param ms - The time in milliseconds.
 * @returns The formatted time string.
 */
function msToTime(ms: number): string {
  const milliseconds = ms % 1000;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);
  const hours = Math.floor(ms / (3600 * 1000));
  // Format string to include hours if greater than zero.
  return `${hours > 0 ? hours + ':' : ''}${minutes < 10 ? '0' + minutes : minutes}:${
    seconds < 10 ? '0' + seconds : seconds
  }.${milliseconds}`;
}

/**
 * Retrieves the transfer time (in milliseconds) from the REST API.
 * It calls the `/transfer/time` endpoint with the required query parameters:
 * - sourceToken: The address of the source token.
 * - destinationToken: The address of the destination token.
 * - messenger: The messenger type (e.g., "ALLBRIDGE").
 *
 * @param sourceToken - The source token address.
 * @param destinationToken - The destination token address.
 * @param messenger - The messenger type.
 * @returns The average transfer time in milliseconds.
 */
async function getTransferTime(
  sourceToken: string,
  destinationToken: string,
  messenger: string,
): Promise<number> {
  // Build query parameters using the REST API
  const params = new URLSearchParams({
    sourceToken,
    destinationToken,
    messenger,
  });

  // Call the REST API endpoint `/transfer/time`
  const response = await axios.get(`${restApiUrl}/transfer/time?${params.toString()}`);
  // The API is expected to return the transfer time (in milliseconds) as a number.
  return response.data;
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

async function main() {
  try {
    const messenger = process.env.MESSENGER || 'ALLBRIDGE';
    // Fetch tokens from REST API
    const tokens = await getTokens();
    // Find the source token: chain "ETH" and symbol "USDT"
    const sourceToken = ensure(tokens.find((token) => token.chainSymbol === 'ETH' && token.symbol === 'USDT'));
    // Find the destination token: chain "TRX" and symbol "USDT"
    const destinationToken = ensure(tokens.find((token) => token.chainSymbol === 'TRX' && token.symbol === 'USDT'));

    if (!sourceToken || !destinationToken) {
      throw new Error('Source and destination token addresses must be defined in environment variables.');
    }

    // Get the transfer time in milliseconds from the REST API.
    const transferTimeMs = await getTransferTime(sourceToken.tokenAddress, destinationToken.tokenAddress, messenger);

    // Log the formatted transfer time.
    console.log(
      `Average transfer time from source token ${sourceToken.tokenAddress} to destination token ${destinationToken.tokenAddress} is ${msToTime(transferTimeMs)}`,
    );
  } catch (error) {
    console.error('Error fetching transfer time:', error);
  }
}

main()
.then(() => {
  console.log('Done');
})
.catch((e) => {
  console.error(e);
});
