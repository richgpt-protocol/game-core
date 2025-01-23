import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFCM1737629155172 implements MigrationInterface {
    name = 'AddFCM1737629155172'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`fcm\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`fcm\``);
    }

}
