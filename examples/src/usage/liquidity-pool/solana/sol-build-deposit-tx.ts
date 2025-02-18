import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import solanaWeb3, { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

dotenv.config({ path: '.env' });

const restApiUrl = getEnvVar("REST_API_URL");
const tokenAddress = getEnvVar("SOL_TOKEN_ADDRESS");
const accountAddress = getEnvVar("SOL_ACCOUNT_ADDRESS");
const privateKey = getEnvVar("SOL_PRIVATE_KEY");

const main = async () => {
  try {
    // Request deposit transaction
    const depositUrl = `${restApiUrl}/raw/deposit?ownerAddress=${accountAddress}&tokenAddress=${tokenAddress}&amount=1`;
    console.log(`Requesting deposit transaction from: ${depositUrl}`);
    const { data: rawTransaction } = await axios.get(depositUrl);

    // Extract raw transaction hex
    const rawTxHex = rawTransaction.data;
    console.log(`Received raw transaction (truncated): ${rawTxHex.substring(0, 30)}...`);

    // Prepare transaction
    const keypair = solanaWeb3.Keypair.fromSecretKey(bs58.decode(privateKey));
    const txBuffer = Buffer.from(rawTxHex, 'hex');
    const transaction = VersionedTransaction.deserialize(txBuffer);
    transaction.sign([keypair]);

    // Send transaction
    const connection = new solanaWeb3.Connection(getEnvVar("SOL_NODE_RPC_URL"), 'confirmed');
    const txid = await connection.sendTransaction(transaction);

    console.log("Token deposit successful, transaction ID:", txid);
  } catch (error: any) {
    console.error("Error during execution: ", error.response?.data || error.message);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
