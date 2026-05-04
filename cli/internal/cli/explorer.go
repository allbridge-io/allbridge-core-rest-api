package cli

import "strings"

// txExplorerURL maps (chain, txHash, network) to a clickable explorer URL.
// Returns empty string for chains we don't know an explorer for; callers
// should treat empty as "no link, just show the hash".
//
// `network` is the cfg.Network value ("mainnet" / "testnet"); empty falls
// back to mainnet. This is intentionally a flat switch rather than a
// table lookup — the hash format / URL pattern varies per chain (0x
// prefix for EVM, base58 for Solana, base16 for Tron, etc.) and inlining
// the variations is clearer than a struct of templates.
func txExplorerURL(chainSymbol, txHash, network string) string {
	if txHash == "" {
		return ""
	}
	hashNo0x := strings.TrimPrefix(txHash, "0x")
	isTest := strings.EqualFold(network, "testnet")

	switch strings.ToUpper(chainSymbol) {
	// ─── EVM L1/L2 ────────────────────────────────────────────────────
	case "ETH":
		if isTest {
			return "https://sepolia.etherscan.io/tx/0x" + hashNo0x
		}
		return "https://etherscan.io/tx/0x" + hashNo0x
	case "SPL":
		// SPL is the Allbridge symbol for Ethereum Sepolia testnet.
		return "https://sepolia.etherscan.io/tx/0x" + hashNo0x
	case "ARB":
		if isTest {
			return "https://sepolia.arbiscan.io/tx/0x" + hashNo0x
		}
		return "https://arbiscan.io/tx/0x" + hashNo0x
	case "BAS", "BASE":
		if isTest {
			return "https://sepolia.basescan.org/tx/0x" + hashNo0x
		}
		return "https://basescan.org/tx/0x" + hashNo0x
	case "AVA":
		if isTest {
			return "https://testnet.snowtrace.io/tx/0x" + hashNo0x
		}
		return "https://snowtrace.io/tx/0x" + hashNo0x
	case "OPT":
		if isTest {
			return "https://sepolia-optimism.etherscan.io/tx/0x" + hashNo0x
		}
		return "https://optimistic.etherscan.io/tx/0x" + hashNo0x
	case "POL", "POLY":
		if isTest {
			return "https://amoy.polygonscan.com/tx/0x" + hashNo0x
		}
		return "https://polygonscan.com/tx/0x" + hashNo0x
	case "BNB", "BSC":
		if isTest {
			return "https://testnet.bscscan.com/tx/0x" + hashNo0x
		}
		return "https://bscscan.com/tx/0x" + hashNo0x
	case "AMO", "CEL":
		// Allbridge calls Celo Alfajores testnet AMO; CEL is the mainnet.
		if isTest || strings.EqualFold(chainSymbol, "AMO") {
			return "https://celo-alfajores.blockscout.com/tx/0x" + hashNo0x
		}
		return "https://celoscan.io/tx/0x" + hashNo0x

	// ─── Non-EVM ───────────────────────────────────────────────────────
	case "SOL":
		if isTest {
			return "https://solscan.io/tx/" + hashNo0x + "?cluster=devnet"
		}
		return "https://solscan.io/tx/" + hashNo0x
	case "TRX":
		if isTest {
			return "https://nile.tronscan.org/#/transaction/" + hashNo0x
		}
		return "https://tronscan.org/#/transaction/" + hashNo0x
	case "SRB", "STLR":
		// Soroban + Stellar share stellar.expert.
		if isTest {
			return "https://stellar.expert/explorer/testnet/tx/" + hashNo0x
		}
		return "https://stellar.expert/explorer/public/tx/" + hashNo0x
	case "ALG":
		if isTest {
			return "https://testnet.allo.info/tx/" + hashNo0x
		}
		return "https://allo.info/tx/" + hashNo0x
	case "STX":
		if isTest {
			return "https://explorer.hiro.so/txid/0x" + hashNo0x + "?chain=testnet"
		}
		return "https://explorer.hiro.so/txid/0x" + hashNo0x + "?chain=mainnet"
	}
	return ""
}
