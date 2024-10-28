import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTxNote1730113408521 implements MigrationInterface {
    name = 'UpdateTxNote1730113408521'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`deposit_tx\` DROP COLUMN \`note\``);
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` ADD \`note\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`wallet_tx\` ADD \`note\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`wallet_tx\` DROP COLUMN \`note\``);
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` DROP COLUMN \`note\``);
        await queryRunner.query(`ALTER TABLE \`deposit_tx\` ADD \`note\` varchar(255) NULL COMMENT 'Note from admin when deposit is approved/rejected by admin'`);
    }

}
