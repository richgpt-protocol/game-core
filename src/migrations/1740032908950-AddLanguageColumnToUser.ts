import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLanguageColumnToUser1740032908950
  implements MigrationInterface
{
  name = 'AddLanguageColumnToUser1740032908950';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`user\` ADD \`language\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`language\``);
  }
}
