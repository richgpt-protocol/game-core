import { MigrationInterface, QueryRunner } from "typeorm";

export class BettingUpgrade1729846863111 implements MigrationInterface {
    name = 'BettingUpgrade1729846863111'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`FK_488a7566d46ce7af10794e2c66a\` ON \`game_usd_tx\``);
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` ADD \`gameUsdTxId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`deposit_tx\` ADD \`note\` varchar(255) NULL COMMENT 'Note from admin when deposit is approved/rejected by admin'`);
        await queryRunner.query(`ALTER TABLE \`bet_order\` DROP FOREIGN KEY \`FK_a8375df8a485f65eec63f5a8a81\``);
        await queryRunner.query(`ALTER TABLE \`bet_order\` CHANGE \`walletTxId\` \`walletTxId\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`game_usd_tx\` DROP COLUMN \`maskingTxHash\``);
        await queryRunner.query(`ALTER TABLE \`game_usd_tx\` ADD \`maskingTxHash\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`bet_order\` ADD CONSTRAINT \`FK_a8375df8a485f65eec63f5a8a81\` FOREIGN KEY (\`walletTxId\`) REFERENCES \`wallet_tx\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` ADD CONSTRAINT \`FK_0c204c35b6c3da9bffac59a5c62\` FOREIGN KEY (\`gameUsdTxId\`) REFERENCES \`game_usd_tx\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` DROP FOREIGN KEY \`FK_0c204c35b6c3da9bffac59a5c62\``);
        await queryRunner.query(`ALTER TABLE \`bet_order\` DROP FOREIGN KEY \`FK_a8375df8a485f65eec63f5a8a81\``);
        await queryRunner.query(`ALTER TABLE \`game_usd_tx\` DROP COLUMN \`maskingTxHash\``);
        await queryRunner.query(`ALTER TABLE \`game_usd_tx\` ADD \`maskingTxHash\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`bet_order\` CHANGE \`walletTxId\` \`walletTxId\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`bet_order\` ADD CONSTRAINT \`FK_a8375df8a485f65eec63f5a8a81\` FOREIGN KEY (\`walletTxId\`) REFERENCES \`wallet_tx\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`deposit_tx\` DROP COLUMN \`note\``);
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` DROP COLUMN \`gameUsdTxId\``);
        await queryRunner.query(`CREATE INDEX \`FK_488a7566d46ce7af10794e2c66a\` ON \`game_usd_tx\` (\`maskingTxHash\`)`);
    }

}
