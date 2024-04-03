# How to run this API framework

The only option to get OTP is through Telegram for now.

## Git clone, switch branch and set environment

> git clone git@github.com:richgpt-protocol/game-core.git

> git switch dev

Rename `.env.example` to `.env` and copy variable below into `.env`

```
JWT_SECRET_KEY=6RjwCdAJAv
JWT_EXPIRATION_TIME=900

DB_TYPE=mysql
DB_USERNAME=root
DB_PASSWORD=rootpass
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=richgpt

OPENAI_API_KEY=<apply via openai>

# opBNB
OPBNB_PROVIDER_RPC_URL=https://opbnb-testnet-rpc.bnbchain.org
OPBNB_CHAIN_ID=5611
OPBNB_USDT_TOKEN_ADDRESS=0x79Dd344db3668816A727A54E21A96c328CAD7d01

# contract address
GAMEUSD_CONTRACT_ADDRESS=0x51B6F9dc5a67fCF62c84E2314651100f8Bc5cF43
GAMEUSD_POOL_CONTRACT_ADDRESS=0xb42Bd62747d043bAe8d54eA3F2746F68092fd0D4
DEPOSIT_CONTRACT_ADDRESS=0x47FE43c06683263D7df0458029Aa201727882E9b
REFERRAL_CONTRACT_ADDRESS=0x5455788FdFbae3479EC5Ecd543C1EaF76eDD7893
REDEEM_CONTRACT_ADDRESS=0xE2f0a96c5A7dA2ba173d14B87189685bc1E4d32C
BNB_PAYOUT_POOL_CONTRACT_ADDRESS=
OPBNB_PAYOUT_POOL_CONTRACT_ADDRESS=0x06b7af58Da1361e528fD663b9f687a0df238Ef63
POINT_REWARD_CONTRACT_ADDRESS=0xb8207E293F9D8CCc3966061b1253F1be65e1972B
CORE_CONTRACT_ADDRESS=0x125CEe4A2dF874e0b663c0F4C761842A653b1Df4
HELPER_CONTRACT_ADDRESS=0xdb5Bdc9a9f4d5C0b2790F55Ff12f5409c021e990

# bot address
WALLET_CREATION_BOT_ADDRESS=0x7AB770425fa2046cEdcE9a253f179e32D1F6cCb9
DEPOSIT_BOT_ADDRESS=0x4d5017fc65A5492F9f5cD303599E8d0d8c80b2bD
PAYOUT_BOT_ADDRESS=0x238a09daB83ab76cBe78a5fb35fc19F40b759001
RESULT_BOT_ADDRESS=0x9Ce31D76f484EC71DB96ba4829F19a20BB91CF71
POINT_REWARD_BOT_ADDRESS=0x746Be31AD862bD757E96A9F9529eCc439E3A1b8C
HELPER_BOT_ADDRESS=0xE6740e0BB83D0F335Ff738aEaE3c93b333c15923

# bot private key, temporarily
WALLET_CREATION_BOT_PRIVATE_KEY=0x5d74e43b61e748677321ca5634dec1e4478e1816d451fa91754517ce80302306
DEPOSIT_BOT_PRIVATE_KEY=0x67a677ea51d5210c05e00c69ac41e58e8125890b2b8d784ebbc3fd297ed2a058
PAYOUT_BOT_PRIVATE_KEY=0xb97ea195e1e96cada59cd430e5f29c9e1a6a6edf6576903ac6ff90026c3bb912
RESULT_BOT_PRIVATE_KEY=0xd1bb4b8f1af9282376d5571b18eaa0edbde39edb5eaec9cdd9c634497e765077
POINT_REWARD_BOT_PRIVATE_KEY=0x2f797be48e4fb91fbaae3f9a4009aeddb763e7b331aa50734be9973468be4073
HELPER_BOT_PRIVATE_KEY=0x3f3b05a7b34f0471b3e4363935ecd45d9759a695a63ef666d8b2859f1bd69f1a

# others
MIN_BET_AMOUNT=0.1
MAX_BET_AMOUNT=10

#Telegram
TG_SESSION_STRING=<apply with [instruction here](https://github.com/richgpt-protocol/game-core/blob/dev/src/shared/services/telegram.service.ts#L11)>
TG_API_ID=<>
TG_API_HASH=<>
```

## Download and install mySQL

https://dev.mysql.com/downloads/mysql/

## Install

> npm install

## Create database and initiate database via run seed

> npm run db:create

> npm run build

> npm run seed:run

## Run

> npm run start:dev

## Test environment

### admin

admin account with superuser type for testing purpose: 

username: admin

password: admin888*

### reset database

clear all data and reinitiate database

> npm run db:drop

> npm run build

> npm run db:create

> npm run seed:run

## Generate type for smart contract

> ./node_modules/.bin/typechain --target=ethers-v6 "src/contract/abis/*.json" --out-dir src/contract

## UI integration

Refer Swagger UI(http://localhost:3000/api/docs) for more information.

### Sign In

/api/v1/auth/sign-in

### Sign Up & OTP(select provider)

/api/v1/user/sign-up

### OTP(insert)

/api/v1/auth/user-login 
note: resend OTP in 60 seconds

### Dashboard

profile: /api/v1/user/get-profile 
Note: no name record in database yet

notification: /api/v1/user/get-notification

live draw start in: /api/v1/game/get-available-games 
Note: endDate of first element

daily winners: /api/v1/game/get-leaderboard

total leaderboard: /api/v1/game/get-leaderboard

### Live Draw

use socket.io to listen to the event

example: https://github.com/richgpt-protocol/game-core/blob/dev/src/game/game.gateway.ts#L89

### Chat

/api/v1/chatbot/send 
Note: please set isInitialMessage=true for every new session of chat

### My Tickets - New, Expanded

/api/v1/wallet/get-user-ticket

claim all: /api/v1/wallet/claim

### Wallet

balance: /api/v1/user/get-profile

transaction history: /api/v1/wallet/get-wallet-tx

### Redemption

balance: /api/v1/user/get-profile

redeem: /api/v1/wallet/request-redeem

### Profile

/api/v1/user/get-profile

ticket history: /api/v1/wallet/get-user-ticket

### Change Email Address

TODO

### Change Phone Number

TODO

### Level Reward

/api/v1/user/get-profile

### Referral

/api/v1/user/get-profile

referees performances: /api/v1/user/get-referee-performance

### Leaderboard Daily

/api/v1/game/get-leaderboard

### Leaderboard Total

/api/v1/game/get-leaderboard

### Past Result

/api/v1/game/get-past-result 
Note: date is required

### Past Result - Number

/api/v1/game/get-past-result 
Note: count & numberPair is required

### Point Redemption

/api/v1/user/get-profile

### Point History

/api/v1/wallet/get-point-history
