import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { sendTrxRawTransaction } from '../../../utils/tronWeb';
import { ensure } from '../../../utils/utils';
import { TronWeb } from 'tronweb';
import Big from 'big.js';

dotenv.config({ path: '.env' });

const fromAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
const toAddress = getEnvVar("ETH_ACCOUNT_ADDRESS");
const tronProviderUrl = getEnvVar("TRONWEB_PROVIDER_URL");
const trxPrivateKey = getEnvVar("TRX_PRIVATE_KEY");
const restApiUrl = getEnvVar("REST_API_URL");

const tronWeb = new TronWeb(
  tronProviderUrl,
  tronProviderUrl,
  tronProviderUrl,
  trxPrivateKey
);


const main = async () => {
  try {
    const chainsResponse = await axios.get(`${restApiUrl}/chains`);
    const chains = chainsResponse.data;

    const sourceChain = chains['TRX'];
    const sourceTokenInfo = ensure(
      sourceChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDT")
    );

    const destinationChain = chains['ETH'];
    const destinationTokenInfo = ensure(
      destinationChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDT")
    );

    const approveParams = new URLSearchParams({
      owner: fromAddress,
      token: sourceTokenInfo.tokenAddress,
    });
    const approveUrl = `${restApiUrl}/raw/approve?${approveParams.toString()}`;
    console.log(`Requesting approval transaction from: ${approveUrl}`);
    const { data: rawApprovalTx } = await axios.get(approveUrl);
    const approveReceipt = await sendTrxRawTransaction(tronWeb, rawApprovalTx);
    console.log("Approval transaction receipt:", JSON.stringify(approveReceipt, null, 2));

    const feeParams = new URLSearchParams({
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
    });
    const feeUrl = `${restApiUrl}/gas/fee?${feeParams.toString()}`;
    const { data: gasFeeOptions } = await axios.get(feeUrl);
    console.log("Gas fee options:", gasFeeOptions);

    const gasFeeOption = ensure(gasFeeOptions["WITH_STABLECOIN"]);
    const gasFeeAmountFloat = gasFeeOption.float;
    const gasFeeAmountInt = gasFeeOption.int;

    const amountToSendFloat = "17";
    const totalAmountFloat = new Big(amountToSendFloat).plus(gasFeeAmountFloat).toFixed();
    console.log(
      `Sending ${amountToSendFloat} ${sourceTokenInfo.symbol} (gas fee ${gasFeeAmountFloat} ${sourceTokenInfo.symbol}). Total amount: ${totalAmountFloat} ${sourceTokenInfo.symbol}`
    );

    const transferParams = new URLSearchParams({
      amount: totalAmountFloat,
      fromAccountAddress: fromAddress,
      toAccountAddress: toAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
      gasFeePaymentMethod: "WITH_STABLECOIN",
      fee: gasFeeAmountInt,
    });
    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log(`Requesting transfer transaction from: ${transferUrl}`);
    const { data: rawTransferTx } = await axios.get(transferUrl);
    const transferReceipt = await sendTrxRawTransaction(tronWeb, rawTransferTx);
    console.log("Transfer transaction receipt:", transferReceipt);
  } catch (error) {
    console.error("Error during execution:", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
