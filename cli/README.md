# allbridge — power CLI for Allbridge Core

Single-binary Go CLI that wraps the Allbridge REST API and (optionally) signs &
broadcasts transactions for the supported chains. Designed for power users,
scripts and CI: every command speaks `--json`, exit codes are stable, prompts
are skippable.

## Status

Early MVP. Surface today:

| Group        | Commands                                                   | Backed by                  |
|--------------|------------------------------------------------------------|----------------------------|
| `chains`     | `ls`, `show`                                               | `GET /chains`              |
| `tokens`     | `ls`, `show`                                               | `GET /tokens`              |
| `bridge`     | `quote`, `routes`, `plan`, `send`                          | `POST /bridge/*`, `/raw/*` |
| `tx`         | `build`, `sign`, `broadcast`                               | `POST /raw/*`              |
| `transfers`  | `status`                                                   | `GET /transfer/status`     |
| `stellar`    | `trustline check`, `trustline add`                         | `/check/stellar/*`, `/raw/stellar/trustline` |
| `algorand`   | `optin check`, `optin add`                                 | `/check/algorand/*`, `/raw/algorand/optin` |
| `wallet`     | `add`, `import`, `list`, `rm`, `set-default`, `export`     | local encrypted keystore   |
| `config`     | `set`, `get`, `list`                                       | `~/.config/allbridge/`     |
| `completion` | `bash`, `zsh`, `fish`, `powershell`                        | Cobra shell completion     |

Signing & broadcasting are fully implemented for **EVM**, **Solana** and
**Tron** — the three chain families that together cover ≈95% of historical
Allbridge transfer volume. Other families (Stellar, Soroban, Algorand, Sui,
Stacks) can build raw transactions today and need to be signed and broadcast
through external tooling — see the [Detached signing](#detached-signing-bring-your-own-tool)
cookbook below.

## Install

### GitHub Releases

Release binaries are published from `cli/v*` tags as GitHub Release assets:
Linux, macOS and Windows archives plus `checksums.txt`.

Download the archive that matches your OS and architecture, verify the
checksum, then extract `allbridge` and place it somewhere on your `PATH`.

### Go install

```bash
go install github.com/allbridge-io/rest-api/cli/cmd/allbridge@latest
```

For local development builds, `make install` still works:

```bash
make install
```

### Homebrew

Install from the dedicated Homebrew tap:

```bash
brew tap allbridge-io/tap
brew install allbridge
```

Upgrade and uninstall follow normal Homebrew workflow:

```bash
brew upgrade allbridge
brew uninstall allbridge
```

## Quick start

The default API endpoint is `https://core-rest-api.allbridge.io` — no config
needed for the public deployment. Override with `--api-url` per-call or
persistently with `allbridge config set api.url ...`.

```bash
allbridge chains ls
allbridge tokens ls --chain ETH
allbridge bridge quote --from ETH:USDT --to SOL:USDT --amount 100 --messenger Allbridge
allbridge bridge send  --from ETH:USDT --to SOL:USDT --amount 100 \
                       --recipient 7xKX...   --wallet default
allbridge transfers status 0xabc123…
```

Add `--json` to any command for machine-readable output.

## Wallets

The CLI ships with an encrypted local keystore (scrypt + AES-GCM). For
the three families with a native signer — EVM, Solana, Tron — you can
generate the key on-device with `wallet add`. For everything else, hold
the key in your existing tool and use the [detached signing](#detached-signing-bring-your-own-tool)
flow below.

```bash
# Generate a fresh key on-device. --reveal prints the private key once
# for backup; without --reveal only the encrypted form is stored.
allbridge wallet add main      --family EVM    --reveal
allbridge wallet add main-sol  --family SOLANA --reveal
allbridge wallet add main-trx  --family TRX

# Or import an existing key.
allbridge wallet import legacy     --family EVM    --hex 0xabc...
allbridge wallet import legacy-sol --family SOLANA --base58 5J3...

allbridge wallet list
allbridge wallet set-default main
```

The keystore lives at `$XDG_CONFIG_HOME/allbridge/keystore.json` (or
`~/.config/allbridge/`). Each signing command prompts for the keystore
password interactively.

### Non-interactive passphrase (CI / cron / scheduled jobs)

For automated environments where prompting isn't possible, the CLI
resolves the passphrase from the highest-priority source available:

```
1. --passphrase-cmd "<shell command>"   stdout becomes the passphrase
2. --passphrase-file <path>             file contents (chmod 0400)
3. $ALLBRIDGE_PASSPHRASE                env var
4. stdin (when not a TTY)               echo "$PASS" | allbridge ...
5. interactive prompt                   default for human use
```

Examples:

```bash
# Delegate to a secret manager (1Password, Bitwarden, pass, gpg-agent, ...)
allbridge bridge send ... --passphrase-cmd "op read op://Vault/allbridge/passphrase"
allbridge bridge send ... --passphrase-cmd "pass show allbridge/main"

# Static file on a hardened mount
chmod 0400 ~/.config/allbridge/passphrase
allbridge bridge send ... --passphrase-file ~/.config/allbridge/passphrase

# Env var (simplest, but visible in /proc/<pid>/environ on Linux)
ALLBRIDGE_PASSPHRASE="..." allbridge bridge send ...
```

All sources have trailing `\r\n` stripped so `echo "secret" > file` and
`pass show name` both work without surprises.

#### Security notes

- Prefer `--passphrase-cmd` with a real secret manager (`op`, `pass`,
  `bw`, `gpg-agent`) over the env var. The env var is the easiest to
  set up but the easiest to leak: anything readable by the same UID
  can `cat /proc/<pid>/environ`.
- The CLI calls `os.Unsetenv("ALLBRIDGE_PASSPHRASE")` immediately
  after first read so the secret doesn't propagate into helper
  processes (clipboard, link openers, the `--passphrase-cmd` shell)
  via `exec`'s default env-inherit. Other tools that import the value
  before invoking `allbridge` are still on you to clean up.
- `--passphrase-file` and `keystore.json` should be `chmod 600`. The
  CLI prints a warning to stderr if either is broader than that.
  Running on exFAT / SMB / FAT32 (where mode bits are advisory)
  silences the warning but doesn't change the underlying exposure;
  use a real POSIX filesystem for secrets.

## Shell completion

```bash
allbridge completion bash > /etc/bash_completion.d/allbridge
allbridge completion zsh > "${fpath[1]}/_allbridge"
allbridge completion fish > ~/.config/fish/completions/allbridge.fish
allbridge completion powershell > allbridge.ps1
```

## Detached signing (bring your own tool)

For every chain — including the natively supported EVM/SOL — you can
**bypass the built-in signer** and sign with whatever tool you already use.
The CLI is split into three composable atoms:

```
allbridge tx build       → fetch unsigned tx (any chain) from /raw/*
<your tool>              → sign it however you like
allbridge tx broadcast   → send signed tx to chain RPC
```

This keeps the CLI useful even when you keep keys in a hardware wallet,
TronLink, Phantom, Freighter, foundry's `cast`, or your own custody system —
the CLI never has to see the private key.

### EVM — sign with `cast` (foundry)

```bash
allbridge tx build bridge --from ETH:USDT --to SOL:USDT --amount 100 \
    --sender 0xYou --recipient 7xKX... --messenger ALLBRIDGE \
    --fee-method WITH_NATIVE_CURRENCY > unsigned.json

# Sign the call data with cast (uses your foundry keystore).
cast wallet sign --keystore ~/.foundry/keystores/main \
    "$(jq -r .data unsigned.json)" > signed.hex

# Broadcast through your RPC.
allbridge tx broadcast --chain ETH --rpc $ETH_RPC --in signed.hex
```

### EVM — sign with a Ledger hardware wallet

The CLI doesn't ship native USB HID code; instead lean on `cast wallet
send --ledger` (foundry), which streams the prompts to the device.

```bash
allbridge tx build bridge --from ETH:USDT --to SOL:USDT --amount 100 \
    --sender 0xYou --recipient 7xKX... --messenger ALLBRIDGE \
    --fee-method WITH_NATIVE_CURRENCY > unsigned.json

# `cast` builds, signs and broadcasts in one go on the Ledger.
# Requires the Ethereum app open on the device.
cast send "$(jq -r .to unsigned.json)" \
    --rpc-url "$ETH_RPC" \
    --ledger --hd-path "m/44'/60'/0'/0/0" \
    --value "$(jq -r .value unsigned.json)" \
    "$(jq -r .data unsigned.json)"
```

### Solana — sign with `solana` CLI

```bash
allbridge tx build bridge --from SOL:USDC --to ETH:USDC --amount 100 \
    --sender YourSolAddr --recipient 0x... --messenger ALLBRIDGE \
    --output-format base64 > unsigned.b64

solana transfer-with-memo ...    # or solana sign-offline-transaction
# (solana CLI signs the deserialised tx; copy the signed base64 back)

allbridge tx broadcast --chain SOL --in signed.b64
```

### Solana — sign with a Ledger hardware wallet

The Solana CLI talks to Ledger via the `usb://ledger` keypair URI:

```bash
allbridge tx build bridge --from SOL:USDC --to ETH:USDC --amount 100 \
    --sender "$(solana-keygen pubkey usb://ledger)" \
    --recipient 0x... --messenger ALLBRIDGE \
    --output-format base64 > unsigned.b64

# Sign offline with the Ledger Solana app open.
solana sign-offline-transaction \
    --keypair usb://ledger \
    "$(cat unsigned.b64)" > signed.b64

allbridge tx broadcast --chain SOL --in signed.b64
```

### Tron — sign with TronLink / TronWeb

```bash
allbridge tx build bridge --from TRX:USDT --to ETH:USDT --amount 100 \
    --sender TYourAddr --recipient 0x... --messenger ALLBRIDGE > unsigned.json

# In a Node script (or TronLink popup), call tronWeb.trx.sign(unsigned).
node -e "tronWeb.trx.sign(require('./unsigned.json')).then(s => \
    require('fs').writeFileSync('signed.json', JSON.stringify(s)))"

allbridge tx broadcast --chain TRX --in signed.json
```

### Stellar / Soroban — sign with `stellar` CLI

```bash
allbridge tx build bridge --from STLR:USDC --to ETH:USDC --amount 100 \
    --sender GYour... --recipient 0x... --messenger ALLBRIDGE \
    --output-format xdr > unsigned.xdr

stellar tx sign unsigned.xdr --network mainnet \
    --secret-key-name main > signed.xdr

allbridge tx broadcast --chain STLR --in signed.xdr
```

### Algorand — sign with `goal`

```bash
allbridge tx build bridge --from ALG:USDC --to ETH:USDC --amount 100 \
    --sender YourAlgo... --recipient 0x... --messenger ALLBRIDGE \
    --output-format msgpack > unsigned.msgp

goal clerk sign --infile unsigned.msgp --outfile signed.msgp \
    --signer-account-name main

allbridge tx broadcast --chain ALG --in signed.msgp
```

### Sui — sign with `sui keytool`

```bash
allbridge tx build bridge --from SUI:USDC --to ETH:USDC --amount 100 \
    --sender 0xYour --recipient 0x... --messenger ALLBRIDGE \
    --output-format base64 > unsigned.b64

sui keytool sign --address 0xYour --data "$(cat unsigned.b64)" > signed.json

allbridge tx broadcast --chain SUI --in signed.json
```

### Stacks — sign with `stx`

```bash
allbridge tx build bridge --from STX:USDC --to ETH:USDC --amount 100 \
    --sender SP... --recipient 0x... --messenger ALLBRIDGE > unsigned.hex

stx sign-tx --in unsigned.hex --key $STX_KEY > signed.hex

allbridge tx broadcast --chain STX --in signed.hex
```

> The detached path always works; the built-in signer is just a one-command
> shortcut for the three highest-volume chains.

## Architecture

```
cmd/allbridge/        # entry point
internal/cli/         # cobra commands
internal/api/         # REST client (hand-written, swappable with oapi-codegen)
internal/render/      # table / json / yaml output, lipgloss styles, spinner
internal/wallet/      # encrypted local keystore (scrypt + AES-GCM)
internal/sign/        # per-chain signers (EVM full, others stub)
internal/broadcast/   # per-chain broadcasters
internal/config/      # XDG-config aware loader
internal/version/     # ldflags-injected build info
api/swagger.json      # snapshot of the REST contract
```

## Two REST clients (and why)

The CLI ships with two REST clients that intentionally coexist:

1. **`internal/api/client.go`** — hand-written, ~150 lines, uses
   `json.RawMessage` for response bodies. This is what every command in
   `internal/cli/*` calls today. Adding a new endpoint takes one line of code
   and never breaks on API schema changes.

2. **`internal/api/gen/openapi.gen.go`** — typed client generated from
   `api/swagger.json` by [oapi-codegen](https://github.com/oapi-codegen/oapi-codegen).
   It contains a Go struct for every request/response and a typed method for
   every endpoint, so you get autocompletion, refactor safety, and a
   compile-time error the moment the REST contract changes. The generator keeps
   pruning enabled so unused SDK schemas from the swagger snapshot do not create
   Go identifier collisions, and uses `HTTPResponse` as the operation response
   suffix to avoid component-schema name conflicts.

**Today** every command uses the hand-written client because it lets us ship
without waiting on every swagger quirk (the Allbridge spec uses `anyOf` in a
few places that oapi-codegen handles awkwardly). **Tomorrow**, as the surface
stabilises, you can swap consumers over to the generated client one at a time:

```go
// Before (hand-written):
var raw json.RawMessage
rt.client.Get(ctx, "/bridge/quote", q, &raw)

// After (generated, typed):
resp, err := genClient.BridgeQuote(ctx, &gen.BridgeQuoteParams{...})
```

To (re)generate the typed client:

```bash
make gen
```

That target refreshes `api/swagger.json` from `../rest-api/public/` and
writes `internal/api/gen/openapi.gen.go`. The generator is invoked via
`go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.4.1`
inside the `//go:generate` directive, so there is **no install step and no
PATH dependency** — `go` itself fetches and runs the pinned generator.

## Release

CLI releases are intentionally separate from REST API Docker releases. Use a
`cli/v*` tag:

```bash
git tag cli/v0.1.0
git push origin cli/v0.1.0
```

The `CLI Release` workflow strips the `cli/` prefix for GoReleaser artifact
versioning, then publishes cross-platform archives plus checksums to a GitHub
Release on the original `cli/v*` tag. CLI releases do not become the repository
`latest` release, so they do not interfere with REST API Docker releases.

## Exit codes

| Code | Meaning                           |
|------|-----------------------------------|
| 0    | success                           |
| 1    | user error (bad flags, etc.)      |
| 2    | network / API error               |
| 3    | chain / signer error              |
| 4    | wallet / keystore error           |

## License

Same as the parent repo (ISC).
