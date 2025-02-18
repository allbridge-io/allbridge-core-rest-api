import axios from "axios";
import * as dotenv from "dotenv";
import { getEnvVar } from "../../../utils/env";

dotenv.config({ path: ".env" });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SUI_TOKEN_ADDRESS");
const accountAddress = getEnvVar("SUI_ACCOUNT_ADDRESS");

const main = async () => {
  try {
    // Get native token balance
    const nativeBalanceUrl = `${restApiUrl}/token/native/balance?address=${accountAddress}&chain=SUI`;
    console.log(`Requesting native token balance from: ${nativeBalanceUrl}`);
    const { data: nativeTokenBalance } = await axios.get(nativeBalanceUrl);
    console.log("Native Token Balance: ", nativeTokenBalance);

    // Get token balance
    const tokenBalanceUrl = `${restApiUrl}/token/balance?address=${accountAddress}&token=${tokenAddress}`;
    console.log(`Requesting token balance from: ${tokenBalanceUrl}`);
    const { data: tokenBalance } = await axios.get(tokenBalanceUrl);
    console.log("Token Balance: ", tokenBalance.result);
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
