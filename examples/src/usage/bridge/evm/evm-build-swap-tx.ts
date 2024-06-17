import Web3 from "web3";
import * as dotenv from "dotenv";
import axios from "axios";
import { getEnvVar } from "../../../utils/env";
import { sendRawTransaction } from "../../../utils/web3";
import { ensure } from "../../../utils/utils";
import { TransactionConfig } from "web3-core";

dotenv.config({ path: ".env" });
const main = async () => {
  const baseUrl = getEnvVar("REST_API_URL");
  // sender address
  const fromAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
  // recipient address
  const toAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");

  // configure web3
  const web3 = new Web3(getEnvVar("WEB3_PROVIDER_URL"));
  const account = web3.eth.accounts.privateKeyToAccount(getEnvVar("ETH_PRIVATE_KEY"));
  web3.eth.accounts.wallet.add(account);

  const chains = (await axios.get(`${baseUrl}/chains`)).data;

  const sourceChain = chains['ETH'];
  const sourceTokenInfo = ensure(sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDT"));

  const destinationChain = chains['ETH'];
  const destinationTokenInfo = ensure(destinationChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDC"));

  const amount = parseFloat("1.01") * (10 ** sourceTokenInfo.decimals);

  const minimumReceiveAmount = (await axios.get(
    `${baseUrl}/bridge/receive/calculate`
    + `?sourceToken=${sourceTokenInfo.tokenAddress}`
    + `&destinationToken=${destinationTokenInfo.tokenAddress}`
    + `&amount=${amount}`
    + `&messenger=ALLBRIDGE`
  )).data;
  // initiate transfer
  const rawTransactionTransfer = await axios.get(
    `${baseUrl}/raw/swap?amount=${amount}`
    + `&sender=${fromAddress}`
    + `&recipient=${toAddress}`
    + `&sourceToken=${sourceTokenInfo.tokenAddress}`
    + `&destinationToken=${destinationTokenInfo.tokenAddress}`
    + `&minimumReceiveAmount=${parseFloat(minimumReceiveAmount.amountReceivedInFloat) * (10 ** sourceTokenInfo.decimals)}`
  );

  console.log(`Swaping ${amount / (10 ** sourceTokenInfo.decimals)} ${sourceTokenInfo.symbol}`);
  const txReceipt = await sendRawTransaction(web3, rawTransactionTransfer.data as TransactionConfig);
  console.log("tx id:", txReceipt.transactionHash);
};

main()
  .then(() => {
    console.log("Done");
  })
  .catch((e) => {
    console.error(e);
  });
