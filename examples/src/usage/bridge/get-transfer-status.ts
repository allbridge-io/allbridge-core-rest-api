import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../utils/env';

dotenv.config({ path: '.env' });

const main = async () => {
  const baseUrl = getEnvVar('REST_API_URL');
  const txId = getEnvVar("SENT_TX_ID");
  const chainSymbol = "TRX"; // TRX, ETH, BSC, etc.

  console.log("Fetching transfer status...");
  try {
    const response = await axios.get(`${baseUrl}/transfer/status?chain=${chainSymbol}&txId=${txId}`);
    const sendStatus = response.data;
    console.log("Send Status: ", sendStatus);
  } catch (error) {
    console.error("Error fetching transfer status: ", error);
  }
};

main()
.then(() => {
  console.log("Done");
})
.catch((e) => {
  console.error(e);
});
