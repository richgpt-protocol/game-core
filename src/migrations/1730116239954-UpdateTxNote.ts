import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateTxNote1730116239954 implements MigrationInterface {
    name = 'UpdateTxNote1730116239954'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` ADD \`note\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`wallet_tx\` ADD \`note\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`wallet_tx\` DROP COLUMN \`note\``);
        await queryRunner.query(`ALTER TABLE \`credit_wallet_tx\` DROP COLUMN \`note\``);
    }

}
