import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSquidGameStage21736095282917 implements MigrationInterface {
    name = 'AddSquidGameStage21736095282917'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`jackpot_tx\` (\`id\` int NOT NULL AUTO_INCREMENT, \`txHash\` varchar(255) NULL, \`status\` varchar(255) NOT NULL COMMENT 'S - success, P - pending, F - failed', \`retryCount\` int NOT NULL DEFAULT '0', \`randomHash\` varchar(255) NULL, \`isClaimed\` tinyint NOT NULL DEFAULT 0, \`availableClaim\` tinyint NOT NULL DEFAULT 0, \`payoutAmount\` int NOT NULL DEFAULT '0', \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`walletTxId\` int NOT NULL, \`jackpotId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`jackpot\` (\`id\` int NOT NULL AUTO_INCREMENT, \`projectName\` varchar(255) NOT NULL, \`round\` int NOT NULL, \`startTime\` datetime NOT NULL, \`endTime\` datetime NOT NULL, \`duration\` int NOT NULL, \`minimumBetAmount\` int NOT NULL, \`feeTokenAddress\` varchar(255) NOT NULL, \`feeAmount\` int NOT NULL, \`jackpotHash\` varchar(255) NULL, \`drawWalletId\` int NULL, \`status\` varchar(255) NULL COMMENT 'S - success, P - pending, F - failed', \`txHash\` varchar(255) NULL, \`retryCount\` int NOT NULL DEFAULT '0', \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`claim_jackpot_detail\` (\`id\` int NOT NULL AUTO_INCREMENT, \`matchedCharCount\` int NOT NULL, \`claimAmount\` decimal(30,18) NOT NULL DEFAULT '0.000000000000000000', \`bonusAmount\` decimal(30,18) NOT NULL DEFAULT '0.000000000000000000', \`pointAmount\` decimal(30,18) NOT NULL DEFAULT '0.000000000000000000', \`walletTxId\` int NOT NULL, \`jackpotId\` int NOT NULL, \`jackpotTxId\` int NOT NULL, UNIQUE INDEX \`REL_b005efc18da5347df7a1c676ec\` (\`jackpotTxId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`squid_game_revival\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL, \`stageNumber\` int NOT NULL, \`reviveTime\` int NULL, \`amountPaid\` int NOT NULL DEFAULT '0', \`amountReferred\` int NOT NULL DEFAULT '0', \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`squid_game_participant\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL, \`lastStage\` int NOT NULL, \`participantStatus\` varchar(255) NULL, \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`jackpot_tx\` ADD CONSTRAINT \`FK_7061ecf780ba66da61add898d3d\` FOREIGN KEY (\`walletTxId\`) REFERENCES \`wallet_tx\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`jackpot_tx\` ADD CONSTRAINT \`FK_f41e907459ee4d5bbc705443592\` FOREIGN KEY (\`jackpotId\`) REFERENCES \`jackpot\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`claim_jackpot_detail\` ADD CONSTRAINT \`FK_3088772ec5552a42478356e532f\` FOREIGN KEY (\`walletTxId\`) REFERENCES \`wallet_tx\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`claim_jackpot_detail\` ADD CONSTRAINT \`FK_3d5e985fcdb2273c3d61b26a53a\` FOREIGN KEY (\`jackpotId\`) REFERENCES \`jackpot\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`claim_jackpot_detail\` ADD CONSTRAINT \`FK_b005efc18da5347df7a1c676ece\` FOREIGN KEY (\`jackpotTxId\`) REFERENCES \`jackpot_tx\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`claim_jackpot_detail\` DROP FOREIGN KEY \`FK_b005efc18da5347df7a1c676ece\``);
        await queryRunner.query(`ALTER TABLE \`claim_jackpot_detail\` DROP FOREIGN KEY \`FK_3d5e985fcdb2273c3d61b26a53a\``);
        await queryRunner.query(`ALTER TABLE \`claim_jackpot_detail\` DROP FOREIGN KEY \`FK_3088772ec5552a42478356e532f\``);
        await queryRunner.query(`ALTER TABLE \`jackpot_tx\` DROP FOREIGN KEY \`FK_f41e907459ee4d5bbc705443592\``);
        await queryRunner.query(`ALTER TABLE \`jackpot_tx\` DROP FOREIGN KEY \`FK_7061ecf780ba66da61add898d3d\``);
        await queryRunner.query(`DROP TABLE \`squid_game_participant\``);
        await queryRunner.query(`DROP TABLE \`squid_game_revival\``);
        await queryRunner.query(`DROP INDEX \`REL_b005efc18da5347df7a1c676ec\` ON \`claim_jackpot_detail\``);
        await queryRunner.query(`DROP TABLE \`claim_jackpot_detail\``);
        await queryRunner.query(`DROP TABLE \`jackpot\``);
        await queryRunner.query(`DROP TABLE \`jackpot_tx\``);
    }

}
