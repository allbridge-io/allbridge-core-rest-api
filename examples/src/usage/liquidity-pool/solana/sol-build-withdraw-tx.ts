import axios from "axios";
import * as dotenv from "dotenv";
import { getEnvVar } from "../../../utils/env";
import solanaWeb3, { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

dotenv.config({ path: ".env" });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SOL_TOKEN_ADDRESS");
const accountAddress = getEnvVar("SOL_ACCOUNT_ADDRESS");
const privateKey = getEnvVar("SOL_PRIVATE_KEY");

const main = async () => {
  try {
    const amount = "0.5";
    // Request withdraw transaction
    const withdrawUrl = `${restApiUrl}/raw/withdraw?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=${amount}`;
    console.log(`Requesting withdraw transaction from: ${withdrawUrl}`);
    const { data: rawTransaction } = await axios.get(withdrawUrl);

    // Send the transaction to Solana network
    const txid = await sendRawTransaction(rawTransaction, privateKey, getEnvVar("SOL_NODE_RPC_URL"));

    console.log("Token withdraw successful, transaction ID:", txid);
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

async function sendRawTransaction(rawTransaction: { data: any; }, privateKey: string, solanaRpcUrl: string) {
  const keypair = solanaWeb3.Keypair.fromSecretKey(bs58.decode(privateKey));
  const connection = new solanaWeb3.Connection(solanaRpcUrl, "confirmed");

  const rawTxHex = rawTransaction.data;
  console.log(`Received raw transaction (truncated): ${rawTxHex.substring(0, 30)}...`);

  const txBuffer = Buffer.from(rawTxHex, "hex");
  const transaction = VersionedTransaction.deserialize(txBuffer);
  transaction.sign([keypair]);

  return await connection.sendTransaction(transaction);
}

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));