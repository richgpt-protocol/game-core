import { MigrationInterface, QueryRunner } from "typeorm";

export class WalletChanges1736930107151 implements MigrationInterface {
    name = 'WalletChanges1736930107151'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`wallet_tx\` CHANGE \`txType\` \`txType\` varchar(255) NOT NULL COMMENT 'DEPOSIT, PLAY, CLAIM, REDEEM, REFERRAL, INTERNAL_TRANSFER, CAMPAIGN, GAME_TRANSACTION, CLAIM_JACKPOT'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`wallet_tx\` CHANGE \`txType\` \`txType\` varchar(255) NOT NULL COMMENT 'DEPOSIT, PLAY, CLAIM, REDEEM, REFERRAL, INTERNAL_TRANSFER'`);
    }

}
