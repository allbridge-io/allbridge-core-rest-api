import { RawTransaction } from "@allbridge/bridge-core-sdk";
import {
  AddressLookupTableAccount,
  Connection,
  MessageV0,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export async function sponsorWrapRawTx(params: {
  connection: Connection;
  rawTxHex: string;
  sponsorPubkey: PublicKey;
  fundLamports?: number;
}): Promise<RawTransaction> {
  const { connection, rawTxHex, sponsorPubkey } = params;
  const fundLamports = params.fundLamports ?? 0;

  const originalTx = VersionedTransaction.deserialize(Buffer.from(rawTxHex, "hex"));
  const origMsg = originalTx.message as MessageV0;

  async function loadLookupTables() {
    const lookups = origMsg.addressTableLookups ?? [];
    const lutAccounts: AddressLookupTableAccount[] = [];

    for (const lookup of lookups) {
      const { value } = await connection.getAddressLookupTable(lookup.accountKey);
      if (!value) {
        throw new Error(`Missing lookup table ${lookup.accountKey.toBase58()}`);
      }
      lutAccounts.push(value);
    }

    return { lookups, lutAccounts };
  }

  function resolveAllAccountKeys(
    lookups: MessageV0["addressTableLookups"],
    lutAccounts: AddressLookupTableAccount[]
  ): PublicKey[] {
    const staticKeys = origMsg.staticAccountKeys;

    const lutWritable: PublicKey[] = [];
    const lutReadonly: PublicKey[] = [];

    for (let i = 0; i < lookups.length; i++) {
      const lookup = lookups[i];
      const lutAcc = lutAccounts[i];

      for (const wIdx of lookup.writableIndexes) {
        lutWritable.push(lutAcc.state.addresses[wIdx]);
      }
      for (const rIdx of lookup.readonlyIndexes) {
        lutReadonly.push(lutAcc.state.addresses[rIdx]);
      }
    }

    return [...staticKeys, ...lutWritable, ...lutReadonly];
  }

  const { lookups, lutAccounts } = await loadLookupTables();
  const resolvedKeys = resolveAllAccountKeys(lookups, lutAccounts);

  const {
    numRequiredSignatures: sigCount,
    numReadonlySignedAccounts: roSigCount,
    numReadonlyUnsignedAccounts: roUnsignedCount,
  } = origMsg.header;

  if (sigCount === 0) {
    throw new Error("No signers in original tx, can't infer userPubkey");
  }

  const userPubkey = origMsg.staticAccountKeys[0];
  if (!userPubkey) {
    throw new Error("Cannot infer userPubkey from original tx");
  }

  const writableSignedCount = sigCount - roSigCount;
  const unsignedCount = resolvedKeys.length - sigCount;
  const writableUnsignedCount = unsignedCount - roUnsignedCount;

  function flagsForIndex(idx: number) {
    if (idx < sigCount) {
      return {
        isSigner: true,
        isWritable: idx < writableSignedCount,
      };
    }
    const unsignedIdx = idx - sigCount;
    return {
        isSigner: false,
        isWritable: unsignedIdx < writableUnsignedCount,
    };
  }

  const rebuiltOriginalIxs = origMsg.compiledInstructions.map((ix) => {
    const programId = resolvedKeys[ix.programIdIndex];

    const keys = ix.accountKeyIndexes.map((accountIdx) => {
      const pubkey = resolvedKeys[accountIdx];
      const { isSigner, isWritable } = flagsForIndex(accountIdx);
      return { pubkey, isSigner, isWritable };
    });

    return new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from(ix.data),
    });
  });

  const finalIxs: TransactionInstruction[] =
    fundLamports > 0
      ? [
          SystemProgram.transfer({
            fromPubkey: sponsorPubkey,
            toPubkey: userPubkey,
            lamports: fundLamports,
          }),
          ...rebuiltOriginalIxs,
        ]
      : rebuiltOriginalIxs;

  const newMsgV0 = new TransactionMessage({
    payerKey: sponsorPubkey,
    recentBlockhash: origMsg.recentBlockhash,
    instructions: finalIxs,
  }).compileToV0Message(lutAccounts);

  const versionedTx = new VersionedTransaction(newMsgV0);
  return Buffer.from(versionedTx.serialize()).toString("hex");
}
