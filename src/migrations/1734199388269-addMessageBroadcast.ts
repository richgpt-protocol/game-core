import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessageBroadcast1734199388269 implements MigrationInterface {
    name = 'AddMessageBroadcast1734199388269'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user_notification\` ADD \`channel\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`user_notification\` ADD \`status\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`user_notification\` ADD \`messageId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`user_notification\` ADD \`remarks\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user_notification\` DROP COLUMN \`remarks\``);
        await queryRunner.query(`ALTER TABLE \`user_notification\` DROP COLUMN \`messageId\``);
        await queryRunner.query(`ALTER TABLE \`user_notification\` DROP COLUMN \`status\``);
        await queryRunner.query(`ALTER TABLE \`user_notification\` DROP COLUMN \`channel\``);
    }

}
