# How to run this API framework

## Download and install mySQL

https://dev.mysql.com/downloads/mysql/

## Initiate database and create database

Initiate database with username `root` and password `rootpass`

Access into mysql shell and create database `richgpt`

> mysql -u root -p

> Enter password: rootpass

> CREATE DATABASE richgpt;

> exit

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

## Install

> npm install --force

## Run

> npm run start:dev
