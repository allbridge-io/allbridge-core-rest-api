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
    // Claim rewards using the correct endpoint
    const claimRewardsUrl = `${restApiUrl}/raw/claim?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting claim rewards transaction from: ${claimRewardsUrl}`);
    const { data: rawClaimTx } = await axios.get(claimRewardsUrl);

    // Sign and send transaction
    const txReceipt = await sendSuiRawTransaction(rawClaimTx);
    console.log("Claim Rewards Transaction Hash:", txReceipt);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
