import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../../utils/env';
import { sendTrxRawTransaction } from '../../../utils/tronWeb';
import { ensure } from '../../../utils/utils';
import { TronWeb } from 'tronweb';

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
      destinationChain.tokens.find((tokenInfo: any) => tokenInfo.symbol === "USDC")
    );

    const approvalParams = new URLSearchParams({
      ownerAddress: fromAddress,
      tokenAddress: sourceTokenInfo.tokenAddress,
    });
    const approvalUrl = `${restApiUrl}/raw/approve?${approvalParams.toString()}`;
    console.log(`Requesting approval transaction from: ${approvalUrl}`);

    const { data: rawApprovalTx } = await axios.get(approvalUrl);

    const approveReceipt = await sendTrxRawTransaction(tronWeb, rawApprovalTx);
    console.log("Approval transaction receipt:", JSON.stringify(approveReceipt, null, 2));

    const transferParams = new URLSearchParams({
      amount: "17",
      sender: fromAddress,
      recipient: toAddress,
      sourceToken: sourceTokenInfo.tokenAddress,
      destinationToken: destinationTokenInfo.tokenAddress,
      messenger: "ALLBRIDGE",
      feePaymentMethod: "WITH_NATIVE_CURRENCY",
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
