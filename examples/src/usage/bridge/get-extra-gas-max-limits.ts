import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../utils/env';
import { ensure } from '../../utils/utils';

dotenv.config({ path: '.env' });


async function getChainDetailsMap(restApiUrl: string): Promise<any> {
  const { data } = await axios.get(`${restApiUrl}/chains`);
  return data;
}


async function getExtraGasMaxLimits(
  restApiUrl: string,
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
    const restApiUrl = getEnvVar('REST_API_URL');
    const chainDetailsMap = await getChainDetailsMap(restApiUrl);
    const sourceChain = chainDetailsMap['POL'];
    const sourceToken = ensure(
      sourceChain.tokens.find((token: any) => token.symbol === 'USDC')
    );
    const destChain = chainDetailsMap['TRX'];
    const destToken = ensure(
      destChain.tokens.find((token: any) => token.symbol === 'USDT')
    );
    const extraGasMax = await getExtraGasMaxLimits(
      restApiUrl,
      sourceToken.tokenAddress,
      destToken.tokenAddress,
    );
    console.log('Extra gas max limits:', {
      sourceToken: sourceToken.tokenAddress,
      destinationToken: destToken.tokenAddress,
      limits: extraGasMax,
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
