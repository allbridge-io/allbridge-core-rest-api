<h1 align="center">
   <b>
        <a href="https://core.allbridge.io/"><img src="https://allbridge.io/assets/icons/core.svg" /></a><br>
    </b>
</h1>


<p align="center">
    <a href="https://core.allbridge.io/"><b>Allbridge Core Website</b></a> •
    <a href="https://docs-core.allbridge.io"><b>Documentation</b></a> •
    <a href="https://bridge-core-sdk.web.app"><b>SDK TS doc</b></a>
</p> 

# Allbridge Core REST API

Provides an easy integration with the Allbridge Core ChainBridgeService for DApps vie REST API.

## Table of Contents

- [Configuration](#configuration)
    - [Networks](#networks)
    - [Environment variables](#environment-variables)
- [How to get](#how-to-get)
    - [1. Use existing docker image](#1-use-existing-docker-image)
    - [2. Build and run the docker image](#2-build-and-run-the-docker-image)
- [How to use](#how-to-use)
    - [Swagger](#swagger)
    - [Raw transactions](#raw-transactions)
    - [Tokens](#tokens)
    - [Pools](#pools)
    - [Transfers](#transfers)

## Configuration

### Networks

The Allbridge Core REST API supports the following networks:

- Ethereum (ETH)
- Binance Smart Chain (BSC)
- Tron (TRX)
- Arbitrum (ARB)
- Polygon (POL)
- Avalanche (AVA)
- Optimism (OPT)
- Base (BAS)
- Celo (CEL)
- Solana (SOL)
- Stellar (STLR) & Soroban (SRB)

### Environment variables

The Allbridge Core REST API requires the following environment variables:

- `ENVIRONMENT` - The environment in which the API is running. Possible values are `development` and `production`.
- `ETH_NODE_URL` - The JSON RPC URL of the Ethereum node. For example:
  - `https://ethereum-rpc.publicnode.com`
  - `https://mainnet.infura.io/v3/YOUR-PROJECT-ID`
  - ...
- `BSC_NODE_URL` - The JSON RPC URL of the Binance Smart Chain node. For example:
  - `https://bsc-rpc.publicnode.com`
  - `https://bsc-dataseed1.binance.org`
  - ...
- `TRX_NODE_URL` - The JSON RPC URL of the Tron node. For example:
  - `https://tron-rpc.publicnode.com`
  - `https://api.trongrid.io`
  - ...
- `ARB_NODE_URL` - The JSON RPC URL of the Arbitrum node. For example:
  - `https://arbitrum-one-rpc.publicnode.com`
  - `https://arb1.arbitrum.io/rpc`
  - `https://arbitrum-mainnet.infura.io/v3/YOUR-PROJECT-ID`
  - ...
- `POL_NODE_URL` - The JSON RPC URL of the Polygon node. For example:
  - `https://polygon-bor-rpc.publicnode.com`
  - `https://polygon-rpc.com`
  - ...
- `AVA_NODE_URL` - The JSON RPC URL of the Avalanche node. For example:
  - `https://avalanche-c-chain-rpc.publicnode.com`
  - `https://api.avax.network/ext/bc/C/rpc`
  - `https://avalanche-mainnet.infura.io/v3/YOUR-PROJECT-ID`
  - ...
- `OPT_NODE_URL` - The JSON RPC URL of the Optimism node. For example:
  - `https://optimism-rpc.publicnode.com`
  - `https://mainnet.optimism.io`
  - `https://optimism-mainnet.infura.io/v3/YOUR-PROJECT-ID`
  - ...
- `BAS_NODE_URL` - The JSON RPC URL of the Base node. For example:
  - `https://base-rpc.publicnode.com`
  - `https://mainnet.base.org`
  - `https://base-mainnet.infura.io/v3/YOUR-PROJECT-ID`
  - ...
- `CEL_NODE_URL` - The JSON RPC URL of the Celo node. For example:
  - `https://rpc.ankr.com/celo`
  - `https://forno.celo.org`
  - `https://celo-mainnet.infura.io/v3/YOUR-PROJECT-ID`
  - ...
- `SOL_NODE_URL` - The JSON RPC URL of the Solana node. For example:
  - `https://api.mainnet-beta.solana.com`
  - `https://solana-api.projectserum.com`
  - `https://rpc.ankr.com/solana`
  - ...
- `SRB_NODE_URL` - The JSON RPC URL of the Soroban node. For example:
  - `https://www.quicknode.com/stellar` (Soroban JSON RPC by QuickNode)
  - `https://www.blockdaemon.com/soroban` (Blockdaemon)
  - ...
- `STLR_NODE_URL` - The JSON RPC URL of the Stellar node. For example:
  - `https://horizon.stellar.org`
  - `https://stellar-mainnet.rpcpool.com`
  - ...
- `NETWORKS` - A list of supported networks. Possible values are `ETH`, `BSC`, `TRX`, `ARB`, `POL`, `AVA`, `OPT`, `BAS`, `CEL`, `SOL`, `SRB`, `STLR`. For Stellar network, you need to provide both `STLR` and `SRB` networks.


## How to get

### 1. Use existing docker image

The easiest way to use the Allbridge Core REST API is to use the existing docker image. You can pull the image from the Docker Hub and run it with the following command:

```bash
docker run -p 3000:3000 \
    -e ENVIRONMENT="production" \
    -e ETH_NODE_URL="https://ethereum-rpc.publicnode.com" \
    -e BSC_NODE_URL="https://bsc-rpc.publicnode.com" \
    -e TRX_NODE_URL="https://tron-rpc.publicnode.com" \
    -e ARB_NODE_URL="https://arbitrum-one-rpc.publicnode.com" \
    -e POL_NODE_URL="https://polygon-bor-rpc.publicnode.com" \
    -e AVA_NODE_URL="https://avalanche-c-chain-rpc.publicnode.com" \
    -e OPT_NODE_URL="https://optimism-rpc.publicnode.com" \
    -e BAS_NODE_URL="https://base-rpc.publicnode.com" \
    -e CEL_NODE_URL="https://rpc.ankr.com/celo" \
    -e SOL_NODE_URL="https://api.mainnet-beta.solana.com" \
    -e SRB_NODE_URL="...soroban rpc node..." \
    -e STLR_NODE_URL="https://horizon.stellar.org" \
    -e NETWORKS="[\"ETH\",\"BSC\",\"TRX\",\"ARB\",\"POL\",\"AVA\",\"OPT\",\"BAS\",\"CEL\",\"SOL\",\"SRB\",\"STLR\"]" \
    -d allbridge/io.allbridge.rest-api:latest    
```
or use environment variables from the `.env` file:

```bash
docker run -p 3000:3000 --env-file .env -d allbridge/io.allbridge.rest-api:latest
```

### 2. Build and run the docker image
```bash
docker build -t allbridge-core-rest-api .
docker run -p 3000:3000 \
    -e ENVIRONMENT="production" \
    -e ETH_NODE_URL="https://ethereum-rpc.publicnode.com" \
    -e BSC_NODE_URL="https://bsc-rpc.publicnode.com" \
    -e TRX_NODE_URL="https://tron-rpc.publicnode.com" \
    -e ARB_NODE_URL="https://arbitrum-one-rpc.publicnode.com" \
    -e POL_NODE_URL="https://polygon-bor-rpc.publicnode.com" \
    -e AVA_NODE_URL="https://avalanche-c-chain-rpc.publicnode.com" \
    -e OPT_NODE_URL="https://optimism-rpc.publicnode.com" \
    -e BAS_NODE_URL="https://base-rpc.publicnode.com" \
    -e CEL_NODE_URL="https://rpc.ankr.com/celo" \
    -e SOL_NODE_URL="https://api.mainnet-beta.solana.com" \
    -e SRB_NODE_URL="...soroban rpc node..." \
    -e STLR_NODE_URL="https://horizon.stellar.org" \
    -e NETWORKS="[\"ETH\",\"BSC\",\"TRX\",\"ARB\",\"POL\",\"AVA\",\"OPT\",\"BAS\",\"CEL\",\"SOL\",\"SRB\",\"STLR\"]" \
    -d allbridge-core-rest-api 
```

## How to use

### Swagger

After running the docker image, you can access the swagger documentation at `http://localhost:3000/api`. The swagger documentation provides a detailed description of the available endpoints and their parameters.

### Raw transactions

`GET /raw/approve` - Creates a Raw Transaction for approving tokens usage by the bridge

`GET /raw/swap` - Creates a Raw Transaction for initiating the swap of tokens on one chain

`GET /raw/bridge` - Creates a Raw Transaction for initiating the transfer of tokens from one chain to another.

`GET /raw/deposit` - Creates a Raw Transaction for depositing tokens to Liquidity pool

`GET /raw/withdraw` - Creates a Raw Transaction for withdrawing tokens from Liquidity pool

`GET /raw/claim` - Creates a Raw Transaction for claiming rewards from Liquidity pool

### Tokens

`GET /tokens` - Returns a list of supported tokens.

`GET /chains` - Returns ChainDetailsMap containing a list of supported tokens groped by chain.

`GET /token/balance` - Get token balance

`GET /token/native/balance` - Get native (gas) token balance

`GET /token/details` - Get token details

`GET /gas/fee` - Fetches possible ways to pay the transfer gas fee.

`GET /gas/balance` - Get gas balance

`GET /gas/extra/limits` - Get possible limit of extra gas amount.

### Pools

`GET /check/allowance` - Check if the amount of approved tokens is enough

`GET /pool/info/server` - Gets information about the pool-info by token from server

`GET /pool/info/blockchain` - Gets information about the pool-info by token from blockchain

`GET /pool/allowance` - Get amount of tokens approved for poolInfo

`GET /liquidity/details` - Get user balance info on liquidity pool

`GET /liquidity/deposit/calculate` - Calculates the amount of LP tokens that will be deposited

`GET /liquidity/withdrawn/calculate` - Calculates the amount of tokens will be withdrawn

### Transfers

`GET /transfer/time` - Gets the average time in ms to complete a transfer for given tokens and messenger.

`GET /transfer/status` - Fetches information about tokens transfer by chosen chainSymbol and transaction Id from the Allbridge Core API.

`GET /pending/info` - Returns information about pending transactions for the same destination chain and the amount of tokens can be received as a result of transfer considering pending transactions.

`GET /swap/details` - Show swap amount changes (fee and amount adjustment) during send through pools

`GET /bridge/details` - Show bridge amount changes (fee and amount adjustment) during send through pools on source and destination chains

`GET /bridge/receive/calculate` - Calculates the amount of tokens to be received as a result of transfer.

`GET /bridge/send/calculate` - Calculates the amount of tokens to send based on requested tokens amount be received as a result of transfer.
