import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateCampaignModule1731087831778 implements MigrationInterface {
    name = 'UpdateCampaignModule1731087831778'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`campaign\` ADD \`validationParams\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`campaign\` ADD \`claimApproach\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`campaign\` ADD \`maxNumberOfClaims\` int NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`campaign\` DROP COLUMN \`maxNumberOfClaims\``);
        await queryRunner.query(`ALTER TABLE \`campaign\` DROP COLUMN \`claimApproach\``);
        await queryRunner.query(`ALTER TABLE \`campaign\` DROP COLUMN \`validationParams\``);
    }

}
