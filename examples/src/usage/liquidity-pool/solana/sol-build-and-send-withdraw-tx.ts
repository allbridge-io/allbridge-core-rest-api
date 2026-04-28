import axios from "axios";
import * as dotenv from "dotenv";
import { getEnvVar } from "../../../utils/env";
import { sendSolanaRawTransaction } from "../../../utils/solanaWeb";

dotenv.config({ path: ".env" });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SOL_TOKEN_ADDRESS");
const accountAddress = getEnvVar("SOL_ACCOUNT_ADDRESS");
const privateKey = getEnvVar("SOL_PRIVATE_KEY");

const main = async () => {
  try {
    const amount = "0.5";
    const withdrawUrl = `${restApiUrl}/raw/withdraw?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${amount}`;
    console.log(`Requesting withdraw transaction from: ${withdrawUrl}`);
    const { data: rawTransaction } = await axios.get(withdrawUrl);

    const txid = await sendSolanaRawTransaction(
      rawTransaction.data,
      privateKey,
      getEnvVar("SOL_NODE_RPC_URL"),
    );

    console.log("Token withdraw successful, transaction ID:", txid);
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
