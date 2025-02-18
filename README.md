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

<!-- TOC -->
* [Allbridge Core REST API](#allbridge-core-rest-api)
  * [Table of Contents](#table-of-contents)
  * [Configuration](#configuration)
    * [Networks](#networks)
    * [Environment variables](#environment-variables)
  * [How to get](#how-to-get)
    * [Run docker image](#run-docker-image)
    * [Build and run the docker image](#build-and-run-the-docker-image)
    * [Host on Digital Ocean](#host-on-digital-ocean)
    * [Host on Heroku](#host-on-heroku)
      * [Step-by-Step Guide](#step-by-step-guide)
        * [Deploy and release REST-API container](#deploy-and-release-rest-api-container)
        * [One-Time Setup (Optional for Updates)](#one-time-setup-optional-for-updates)
        * [Final Steps](#final-steps)
  * [How to use](#how-to-use)
    * [Swagger](#swagger)
    * [Raw Transactions](#raw-transactions)
    * [Tokens](#tokens)
    * [Pools](#pools)
    * [Transfers](#transfers)
  * [Troubleshooting](#troubleshooting)
<!-- TOC -->

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
- `SRB_NODE_URL` - The JSON RPC URL of the Soroban node. `STLR_NODE_URL` also required. For example:
  - `https://www.quicknode.com/stellar` (Soroban JSON RPC by QuickNode)
  - `https://www.blockdaemon.com/soroban` (Blockdaemon)
  - ...
- `STLR_NODE_URL` - The JSON RPC URL of the Stellar node. `SRB_NODE_URL` also required. For example:
  - `https://horizon.stellar.org`
  - `https://stellar-mainnet.rpcpool.com`
  - ...
- `SUI_NODE_URL` - The JSON RPC URL of the Sui node. For example:
  - `https://sui-rpc.publicnode.com`
  - `https://sui-mainnet-endpoint.blockvision.org`
  - ...
- `HEADERS` - Headers for the API requests. For example:
  - `{"Authorization": "Bearer YOUR-TOKEN"}`
- `TRON_JSON_RPC` - The JSON RPC URL of the Tron node. For example:
  - `https://api.trongrid.io/jsonrpc`
- `JUPITER_URL` - The URL of the Jupiter API. For example:
  - `https://quote-api.jup.ag/v6`

## How to get

### Run docker image

The easiest way to use the Allbridge Core REST API is to use the existing docker image. You can pull the image from the Docker Hub and run it with the following command:

```bash
docker run -p 3000:3000 \
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
    -e SUI_NODE_URL="https://sui-rpc.publicnode.com" \
    -d allbridge/io.allbridge.rest-api:latest    
```
or use environment variables from the `.env` file:

```bash
docker run -p 3000:3000 --env-file .env -d allbridge/io.allbridge.rest-api:latest
```

### Build and run the docker image
```bash
docker build -t allbridge-core-rest-api .
docker run -p 3000:3000 \
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
    -e SUI_NODE_URL="https://sui-rpc.publicnode.com" \
    -d allbridge-core-rest-api 
```
### Host on Digital Ocean

If you are hosting the REST API on Digital Ocean, you may encounter a `403 Forbidden` error. This error is due to the Digital Ocean is blocked by the Allbridge Core API firewall system. To resolve this issue, please open a ticket on our [Discord](https://discord.com/invite/ASuPY8d3E6) and we will provide you with a detailed guide on how to solve it.

### Host on Heroku

If you cannot host Docker, you can use a separate hosting service like Heroku to deploy the REST API.

For detailed instructions on using Heroku's container registry and runtime, see [the official guide](https://devcenter.heroku.com/articles/container-registry-and-runtime).

Below is a step-by-step guide on how to do this.

#### Step-by-Step Guide

1. Sign up for Heroku
   * [Heroku Sing Up](https://id.heroku.com/login)
2. Install Heroku CLI
   * Follow the instructions [here](https://devcenter.heroku.com/articles/heroku-cli#install-the-heroku-cli)
3. Login to Heroku CLI
   * Run the command: `heroku login`
   * If you encounter an 'IP address mismatch' error, disabling iCloud Private Relay may help. More details [here](https://help.heroku.com/CBF0T4AJ/can-t-login-to-heroku-using-cli-getting-ip-address-mismatch)
4. Ensure Docker is Installed
    * Verify Docker is working by running `docker ps`
    * Ensure you are logged in to Heroku with `heroku login`
5. Create a New Heroku App
    * [Create a new app](https://dashboard.heroku.com/new-app) on the Heroku dashboard
6. Set Heroku Stack to Container
    * Run the command: `heroku stack:set container --app <app-name>`
   
##### Deploy and release REST-API container

Repeat steps 7-11 to upgrade to a newer REST-API version

7. Login to Heroku Container Registry
   * Run `heroku container:login` or log in via Docker following [these instructions](https://devcenter.heroku.com/articles/container-registry-and-runtime#logging-in-to-the-registry)
8. Pull the REST-API Locally
   * Run the command: `docker pull --platform linux/amd64 allbridge/io.allbridge.rest-api:<version>`
9. Tag the Docker Image
   * Run the command: `docker tag allbridge/io.allbridge.rest-api:<version> registry.heroku.com/<app-name>/web`
10. Push the Tagged Image to Heroku
    * Run the command: `docker push registry.heroku.com/<app-name>/web`
11. Release the Container on Heroku
    * Run the command: `heroku container:release web --app <app-name>`

##### One-Time Setup (Optional for Updates)

12. Set Configuration Variables
    * Run the commands, like: `heroku config:set ETH_NODE_URL=https://ethereum-rpc.publicnode.com --app <app-name>`
    * Alternatively, you can set it via the Heroku Dashboard under the [app's settings](https://devcenter.heroku.com/articles/config-vars#using-the-heroku-dashboard)

##### Final Steps

13. Retrieve the Base URL
    * Find the base URL in the domains section of your app's settings (`https://dashboard.heroku.com/apps/<app-name>/settings`) on the Heroku Dashboard
    * Or click the button `Open App`
14. Check API Availability
    * Append `/api` to the base URL to check the availability of the Swagger

You are now ready to use your rest-api app.

## How to use

### Swagger

After running the docker image, you can access the swagger documentation at `http://localhost:3000/api`. The swagger documentation provides a detailed description of the available endpoints and their parameters.

### Raw Transactions
| **GET Endpoint**       | **Description**                                                                                                                   |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `/raw/approve`         | Creates a raw transaction for approving token usage (default for bridge transfers; use `type=pool` for liquidity pool approvals). |
| `/raw/pool/approve`    | Creates a raw transaction for approving token usage specifically for liquidity pools.                                             |
| `/raw/bridge/approve`  | Creates a raw transaction for approving token usage specifically for bridge transfers.                                            |
| `/raw/swap`            | Creates a raw transaction for initiating a token swap on a single chain.                                                          |
| `/raw/bridge`          | Creates a raw transaction for initiating a cross-chain token transfer.                                                            |
| `/raw/stellar/restore` | Simulates and checks whether a Stellar transaction requires a restore operation.                                                  |
| `/raw/deposit`         | Creates a raw transaction for depositing tokens into a liquidity pool.                                                            |
| `/raw/withdraw`        | Creates a raw transaction for withdrawing tokens from a liquidity pool.                                                           |
| `/raw/claim`           | Creates a raw transaction for claiming rewards from a liquidity pool.                                                             |

### Tokens
| **GET Endpoint**             | **Description**                                                                     |
|------------------------------|-------------------------------------------------------------------------------------|
| `/chains`                    | Returns a ChainDetailsMap containing a list of supported tokens grouped by chain.   |
| `/tokens`                    | Returns a list of supported tokens.                                                 |
| `/token/balance`             | Retrieves the token balance for a specified account.                                |
| `/token/native/balance`      | Retrieves the native (gas) token balance for an account on a specified chain.       |
| `/token/details`             | Retrieves detailed token information by chain and token address.                    |
| `/gas/fee`                   | Fetches available gas fee payment options for transfers.                            |
| `/gas/balance`               | Retrieves the gas balance for a specified account on a given chain.                 |
| `/gas/extra/limits`          | Retrieves the maximum allowable extra gas amount.                                   |
| `/bridge/allowance`          | Retrieves the amount of tokens approved for bridge transfers.                       |
| `/check/allowance`           | Checks if the approved token amount is sufficient for a transfer or pool operation. |
| `/check/bridge/allowance`    | Checks if the approved token amount is sufficient for a bridge transfer.            |
| `/check/pool/allowance`      | Checks if the approved token amount is sufficient for a liquidity pool deposit.     |
| `/check/stellar/balanceline` | Retrieves Stellar Balance Line information, if available.                           |
| `/pool/allowance`            | Retrieves the amount of tokens approved for liquidity pool operations.              |

### Pools
| **GET Endpoint**                 | **Description**                                                                                   |
|----------------------------------|---------------------------------------------------------------------------------------------------|
| `/raw/approve`                   | Creates a raw transaction for approving token usage (default: transfer; optional: pool).          |
| `/raw/pool/approve`              | Creates a raw transaction for approving token usage specifically for liquidity pool operations.   |
| `/check/allowance`               | Checks if the approved token amount is sufficient for a transfer or pool operation.               |
| `/raw/deposit`                   | Creates a raw transaction for depositing tokens into a liquidity pool.                            |
| `/raw/withdraw`                  | Creates a raw transaction for withdrawing tokens from a liquidity pool.                           |
| `/raw/claim`                     | Creates a raw transaction for claiming rewards from a liquidity pool.                             |
| `/check/pool/allowance`          | Checks if the approved token amount is sufficient for a liquidity pool deposit.                   |
| `/pool/info/server`              | Retrieves pool information (from the server) for a specified token.                               |
| `/pool/info/blockchain`          | Retrieves pool information (directly from the blockchain) for a specified token.                  |
| `/pool/allowance`                | Retrieves the amount of tokens approved for liquidity pool operations.                            |
| `/liquidity/details`             | Retrieves user balance information for a liquidity pool.                                          |
| `/liquidity/deposit/calculate`   | Calculates the number of LP tokens that will be issued upon deposit.                              |
| `/liquidity/withdrawn/calculate` | Calculates the amount of tokens that will be withdrawn from the liquidity pool.                   |

### Transfers
| **GET Endpoint**             | **Description**                                                                                                                           |
|------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `/raw/approve`               | Creates a raw transaction for approving token usage (default: transfer; optional: pool).                                                  |
| `/raw/bridge/approve`        | Creates a raw transaction for approving token usage by the bridge.                                                                        |
| `/raw/swap`                  | Creates a raw transaction for initiating a token swap on one chain.                                                                       |
| `/raw/bridge`                | Creates a raw transaction for initiating a cross-chain token transfer.                                                                    |
| `/raw/stellar/restore`       | Simulates and checks if a Stellar transaction requires a restore operation.                                                               |
| `/transfer/time`             | Retrieves the average transfer completion time (in milliseconds) for the given tokens and messenger.                                      |
| `/transfer/status`           | Fetches transfer status using the chain symbol and transaction ID from the Allbridge Core API.                                            |
| `/pending/info`              | Returns information about pending transfers and the expected received amount, considering pending transactions on the destination chain.  |
| `/swap/details`              | Displays swap details including fee and amount adjustments during transfers via liquidity pools.                                          |
| `/bridge/details`            | Displays detailed bridge transfer information including fee and amount adjustments for both source and destination chains.                |
| `/bridge/receive/calculate`  | Calculates the amount of tokens to be received as a result of a cross-chain transfer.                                                     |
| `/bridge/send/calculate`     | Calculates the amount of tokens required to send based on the desired receive amount.                                                     |
| `/bridge/allowance`          | Retrieves the amount of tokens approved for a bridge transfer.                                                                            |
| `/check/allowance`           | Checks if the approved token amount is sufficient for a transfer or pool operation.                                                       |
| `/check/bridge/allowance`    | Checks if the approved token amount is sufficient for a bridge transfer.                                                                  |
| `/check/stellar/balanceline` | Retrieves Stellar Balance Line information, if available.                                                                                 |

## Troubleshooting
| **Issue**                    | **Possible Cause**                    | **Solution**                                                                                                                                  |
|------------------------------|---------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| API not responding           | No connection to nodes                | Check ENV variable settings                                                                                                                   |
| `403 Forbidden`              | No connection to Allbridge Core API   | Check if outbound traffic is blocked by the firewall.<br/>In case of Digital Ocean, open a ticket on our Discord to receive a detailed guide. |
| Docker startup error         | Port 3000 already in use              | Run `docker run -p 3001:3000`                                                                                                                 |
| `500 Internal Server Error`  | Server misconfiguration               | Check logs using `docker logs <container_id>`.                                                                                                |
| API request timeout          | High latency or incorrect network URL | Use another RPC provider or check the network connection.                                                                                     |