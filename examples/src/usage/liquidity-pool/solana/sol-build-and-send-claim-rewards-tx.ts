import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { sendSolanaRawTransaction } from '../../../utils/solanaWeb';

dotenv.config({ path: '.env' });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SOL_TOKEN_ADDRESS");
const accountAddress = getEnvVar("SOL_ACCOUNT_ADDRESS");
const privateKey = getEnvVar("SOL_PRIVATE_KEY");

const main = async () => {
  try {
    const claimRewardsUrl = `${restApiUrl}/raw/claim?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}`;
    console.log(`Requesting claim rewards transaction from: ${claimRewardsUrl}`);
    const { data: rawTransaction } = await axios.get(claimRewardsUrl);

    const rawTxHex = rawTransaction.data;
    console.log(`Received raw transaction (truncated): ${rawTxHex.substring(0, 30)}...`);

    const txid = await sendSolanaRawTransaction(
      rawTxHex,
      privateKey,
      getEnvVar("SOL_NODE_RPC_URL"),
    );

    console.log("Token claim rewards successful, transaction ID:", txid);
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
