# Execute app through Docker

Check seeds in `database/seeds` folder, update & push to GitHub because seeds need to be run inside the Docker below.

## Main app

`git clone git@github.com:richgpt-protocol/game-core.git`

`cd game-core`

`git switch dev`

`cp env-example .env`

update vars in `.env`

`sudo docker compose pull`

`sudo docker compose up -d --build`

create whitelist user to access mysql database

`sudo docker compose exec -it mysql sh `

`mysql -u root -p`

<password>

`CREATE USER 'localserver'@'202.186.1.36' IDENTIFIED BY 'password';`

`GRANT CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, SELECT, REFERENCES, RELOAD on *.* TO 'localserver'@'202.186.1.36' WITH GRANT OPTION;`

`FLUSH PRIVILEGES;`

run seed

`sudo docker compose exec -it main sh`

`npm run seed:run`

restore 4d dictionary

copy backup folder(which contains 4d dictionary) into game-core folder

`sudo docker compose exec mongodb mongorestore --username root --password <password> /data/backup`

setup domain with ssl

in `data/nginx/app.conf`, replace `test-api.4dgpt.xyz` with actual domain name

in game-core root path, run:

`chmod +x init-letsencrypt.sh`

`sudo ./init-letsencrypt.sh`

please mind that the folder that created by cerbot (using domain name) might postfix with -0001, if encounter error cannot load certificate at the end of `sudo ./init-letsencrypt.sh`, please check the actual folder name in `/etc/letsencrypt/live/` and revise ssl_certificate & ssl_certificate_key accordingly in `data/nginx/app.conf`.

# Others

## Generate type for smart contract

> ./node_modules/.bin/typechain --target=ethers-v6 "src/contract/abis/*.json" --out-dir src/contract
