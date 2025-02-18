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
    const withdrawAmount = "0.5"; // Amount to withdraw

    // Request raw withdraw transaction
    const withdrawUrl = `${restApiUrl}/raw/withdraw?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${withdrawAmount}`;
    console.log(`Requesting withdraw transaction from: ${withdrawUrl}`);
    const { data: rawWithdrawTx } = await axios.get(withdrawUrl);

    // Sign and send transaction
    const txReceipt = await sendSuiRawTransaction(rawWithdrawTx);
    console.log("Withdraw Transaction Hash:", txReceipt);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
