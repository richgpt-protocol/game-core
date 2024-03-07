# How to run this API framework

For testing purpose, current version allow user to register and login directly without otp.

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

> npm run db:create

> npm run seed:run

## Generate type for smart contract

> ./node_modules/.bin/typechain --target=ethers-v6 "src/contract/abis/*.json" --out-dir src/contract
