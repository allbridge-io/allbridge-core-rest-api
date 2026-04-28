import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../utils/env';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const txId = getEnvVar("SENT_TX_ID");
  const chainSymbol = 'TRX';

  try {
    const requestParams = new URLSearchParams({
      chain: chainSymbol,
      txId,
    });
    const { data: transferStatus } = await axios.get(
      `${baseUrl}/transfer/status?${requestParams.toString()}`,
    );
    console.log('Transfer status:', {
      chainSymbol,
      txId,
      transferStatus,
    });
  } catch (error) {
    console.error('Error fetching transfer status:', error);
  }
};

main()
.then(() => {
  console.log("Done");
})
.catch((e) => {
  console.error(e);
});
