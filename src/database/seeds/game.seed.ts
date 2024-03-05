import { Connection } from 'typeorm';
import { Factory, Seeder } from 'typeorm-seeding';
import * as dotenv from 'dotenv';
dotenv.config();

export default class CreateGame implements Seeder {
  public async run(factory: Factory, connection: Connection): Promise<void> {
    const maxBetPerNumber = process.env.MAX_BET_PER_NUMBER;

    const closeAt = new Date();
    if (closeAt.getHours() >= 19) {
      closeAt.setDate(closeAt.getDate() + 1);
    }
    closeAt.setHours(19, 0, 0, 0);

    for (let epoch = 0; epoch < 31; epoch++) {
      await connection
        .createQueryBuilder()
        .insert()
        .into('game')
        .values([{ epoch, maxBetPerNumber, closeAt }])
        .execute();

        closeAt.setDate(closeAt.getDate() + 1);
    }
  }
}
