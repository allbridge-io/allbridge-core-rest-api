import axios from 'axios';
import * as dotenv from 'dotenv';
import { sendSuiRawTransaction } from '../../../utils/sui';
import { getEnvVar } from '../../../utils/env';

dotenv.config({ path: '.env' });
const accountAddress = getEnvVar('SUI_ACCOUNT_ADDRESS');
const tokenAddress = getEnvVar('SUI_TOKEN_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const main = async () => {
  try {
    const depositAmount = "1"; // Amount to deposit

    // Request raw deposit transaction
    const depositUrl = `${restApiUrl}/raw/deposit?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${depositAmount}`;
    console.log(`Requesting deposit transaction from: ${depositUrl}`);
    const { data: rawDepositTx } = await axios.get(depositUrl);

    // Sign and send transaction
    const txReceipt = await sendSuiRawTransaction(rawDepositTx);
    console.log("Deposit Transaction Hash:", txReceipt);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
