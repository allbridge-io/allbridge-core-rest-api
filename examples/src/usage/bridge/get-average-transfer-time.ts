import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../utils/env';
import { ensure } from '../../utils/utils';

dotenv.config({ path: '.env' });


function msToTime(ms: number): string {
  const milliseconds = ms % 1000;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);
  const hours = Math.floor(ms / (3600 * 1000));
  return `${hours > 0 ? hours + ':' : ''}${minutes < 10 ? '0' + minutes : minutes}:${
    seconds < 10 ? '0' + seconds : seconds
  }.${milliseconds}`;
}


async function getTransferTime(
  restApiUrl: string,
  sourceToken: string,
  destinationToken: string,
  messenger: string,
): Promise<number> {
  const params = new URLSearchParams({
    sourceToken,
    destinationToken,
    messenger,
  });

  const response = await axios.get(`${restApiUrl}/transfer/time?${params.toString()}`);
  return response.data;
}


async function getTokens(restApiUrl: string): Promise<any[]> {
  const { data: chains } = await axios.get(`${restApiUrl}/chains`);
  let tokens: any[] = [];
  for (const chainKey in chains) {
    if (Object.prototype.hasOwnProperty.call(chains, chainKey)) {
      tokens = tokens.concat(chains[chainKey].tokens);
    }
  }
  return tokens;
}

async function main() {
  try {
    const restApiUrl = getEnvVar('REST_API_URL');
    const messenger = 'ALLBRIDGE';
    const tokens = await getTokens(restApiUrl);
    const sourceToken = ensure(tokens.find((token) => token.chainSymbol === 'ETH' && token.symbol === 'USDT'));
    const destinationToken = ensure(tokens.find((token) => token.chainSymbol === 'TRX' && token.symbol === 'USDT'));
    const transferTimeMs = await getTransferTime(
      restApiUrl,
      sourceToken.tokenAddress,
      destinationToken.tokenAddress,
      messenger,
    );
    console.log(
      'Average transfer time:',
      {
        messenger,
        sourceToken: sourceToken.tokenAddress,
        destinationToken: destinationToken.tokenAddress,
        milliseconds: transferTimeMs,
        formatted: msToTime(transferTimeMs),
      },
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
