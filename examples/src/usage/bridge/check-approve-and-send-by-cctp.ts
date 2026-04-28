import axios from 'axios';
import * as dotenv from 'dotenv';
import { getEnvVar } from '../../utils/env';
import { toBaseUnits } from '../../utils/amount';
import { ensure } from '../../utils/utils';
import {
  createSigner,
  sendRawTransaction,
} from '../../utils/ethers';

dotenv.config({ path: '.env' });

const privateKey = getEnvVar('ETH_PRIVATE_KEY');
const fromAccountAddress = getEnvVar('ETH_ACCOUNT_ADDRESS');
const toAccountAddress = getEnvVar('ARB_ACCOUNT_ADDRESS', fromAccountAddress);
const restApiUrl = getEnvVar('REST_API_URL');

const signer = createSigner(getEnvVar('WEB3_PROVIDER_URL'), privateKey);

const main = async () => {
  try {
    const chains = (await axios.get(`${restApiUrl}/chains`)).data;

    const sourceToken = ensure(
      chains['ETH'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
    );
    const destinationToken = ensure(
      chains['ARB'].tokens.find((tokenInfo: { symbol: string }) => tokenInfo.symbol === 'USDC'),
    );
    const amountInt = toBaseUnits('1', sourceToken.decimals);

    const allowanceRequestParams = new URLSearchParams({
      amount: amountInt,
      ownerAddress: fromAccountAddress,
      tokenAddress: sourceToken.tokenAddress,
      feePaymentMethod: 'WITH_NATIVE_CURRENCY',
    });
    const { data: isApproved } = await axios.get(
      `${restApiUrl}/check/bridge/allowance?${allowanceRequestParams.toString()}`,
    );
    console.log("Check Allowance: ", isApproved);

    if (!isApproved) {
      const approvalUrl =
        `${restApiUrl}/raw/approve?ownerAddress=${fromAccountAddress}` +
        `&tokenAddress=${sourceToken.tokenAddress}` +
        `&messenger=CCTP`;
      const { data: rawApprovalTx } = await axios.get(approvalUrl);
      const approveReceipt = await sendRawTransaction(signer, rawApprovalTx);
      console.log("Approval Transaction Hash: ", approveReceipt.hash);
    }

    const receiveAmountRequestParams = new URLSearchParams({
      amount: amountInt,
      sourceToken: sourceToken.tokenAddress,
      destinationToken: destinationToken.tokenAddress,
      messenger: 'CCTP',
    });
    const { data: receivedAmount } = await axios.get(
      `${restApiUrl}/bridge/receive/calculate?${receiveAmountRequestParams.toString()}`,
    );
    console.log("Will Receive: ", receivedAmount);

    const transferParams = new URLSearchParams({
      amount: amountInt,
      sender: fromAccountAddress,
      recipient: toAccountAddress,
      sourceToken: sourceToken.tokenAddress,
      destinationToken: destinationToken.tokenAddress,
      messenger: "CCTP",
      feePaymentMethod: 'WITH_NATIVE_CURRENCY',
    });

    const transferUrl = `${restApiUrl}/raw/bridge?${transferParams.toString()}`;
    console.log("Requesting transfer transaction from: ", transferUrl);

    const { data: rawTransferTx } = await axios.get(transferUrl);
    const transferReceipt = await sendRawTransaction(signer, rawTransferTx);
    console.log("Transfer Transaction Hash: ", transferReceipt.hash);
  } catch (error) {
    console.error("Error during execution: ", error);
  }
};

main()
.then(() => console.log("Done"))
.catch((e) => console.error(e));
