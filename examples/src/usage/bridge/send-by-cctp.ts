import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../utils/env';
import Web3, { Transaction } from 'web3';

dotenv.config({ path: '.env' });

const ETH_NODE_RPC_URL = getEnvVar('ETH_NODE_RPC_URL');
const privateKey = getEnvVar('ETH_PRIVATE_KEY');
const fromAccountAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const toAccountAddress = getEnvVar('ARB_ACCOUNT_ADDRESS');
const restApiUrl = getEnvVar('REST_API_URL');

const web3 = new Web3(ETH_NODE_RPC_URL);
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

const sendRawTransaction = async (txData: Transaction) => {
  const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
  return await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
};

const main = async () => {
  try {
    // Fetch chain details
    const chainsResponse = await axios.get(`${restApiUrl}/chains`);
    const chains = chainsResponse.data;

    const sourceToken = chains["ETH"].tokens.find((t: { symbol: string; }) => t.symbol == "USDC");
    const destinationToken = chains["ARB"].tokens.find((t: { symbol: string; }) => t.symbol == "USDC");

    if (!sourceToken || !destinationToken) {
      throw new Error("Token information not found");
    }

    const amount = "1";

    // Check allowance
    const allowanceResponse = await axios.get(
      `${restApiUrl}/bridge/allowance?ownerAddress=${fromAccountAddress}&tokenAddress=${sourceToken.tokenAddress}`
    );
    const isApproved = allowanceResponse.data;
    console.log("Check Allowance: ", isApproved);

    if (!isApproved) {
      const approvalUrl = `${restApiUrl}/raw/approve?ownerAddress=${fromAccountAddress}&tokenAddress=${sourceToken.tokenAddress}&messenger=CCTP`;
      const { data: rawApprovalTx } = await axios.get(approvalUrl);
      const approveReceipt = await sendRawTransaction(rawApprovalTx);
      console.log("Approval Transaction Hash: ", approveReceipt.transactionHash);
    }

    // Get estimated amount to receive
    const receivedAmountResponse = await axios.get(
      `${restApiUrl}/bridge/receive/calculate?amount=${amount}&sourceToken=${sourceToken.tokenAddress}&destinationToken=${destinationToken.tokenAddress}&messenger=CCTP`
    );
    console.log("Will Receive: ", receivedAmountResponse.data);

    // Initiate transfer
    const transferParams = new URLSearchParams({
      amount: amount,
      fromAccountAddress: fromAccountAddress,
      toAccountAddress: toAccountAddress,
      sourceToken: sourceToken.tokenAddress,
      destinationToken: destinationToken.tokenAddress,
      messenger: "CCTP",
    });

    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log("Requesting transfer transaction from: ", transferUrl);

    const { data: rawTransferTx } = await axios.get(transferUrl);
    const transferReceipt = await sendRawTransaction(rawTransferTx);
    console.log("Transfer Transaction Hash: ", transferReceipt.transactionHash);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));