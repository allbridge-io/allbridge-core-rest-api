import axios from 'axios';
import * as dotenv from 'dotenv';
import { TronWeb } from 'tronweb';
import { getEnvVar } from '../../../utils/env';
import { sendTrxRawTransaction } from '../../../utils/tronWeb';
import { ensure } from '../../../utils/utils';

dotenv.config({ path: '.env' });

const fromAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
const toAddress = getEnvVar("TRX_ACCOUNT_ADDRESS");
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
      sourceChain.tokens.find((token: any) => token.symbol === "USDC")
    );

    const destinationChain = chains['TRX'];
    const destinationTokenInfo = ensure(
      destinationChain.tokens.find((token: any) => token.symbol === "USDC")
    );

    const amount = "10";

    const approvalParams = new URLSearchParams({
      owner: fromAddress,
      token: sourceTokenInfo.tokenAddress,
    });
    const approvalUrl = `${restApiUrl}/raw/approve?${approvalParams.toString()}`;
    console.log(`Requesting approval transaction: ${approvalUrl}`);

    const { data: rawApprovalTx } = await axios.get(approvalUrl);
    const approvalReceipt = await sendTrxRawTransaction(tronWeb, rawApprovalTx);
    console.log("Approval transaction result:", JSON.stringify(approvalReceipt, null, 2));

    const transferParams = new URLSearchParams({
      amount: amount,
      fromAccountAddress: fromAddress,
      toAccountAddress: toAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
      feePaymentMethod: "WITH_NATIVE_CURRENCY",
    });
    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log(`Requesting transfer transaction: ${transferUrl}`);

    const { data: rawTransferTx } = await axios.get(transferUrl);
    const transferReceipt = await sendTrxRawTransaction(tronWeb, rawTransferTx);
    console.log("Transfer result (tx id):", transferReceipt.txid);
  } catch (error) {
    console.error("Error during execution:", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
