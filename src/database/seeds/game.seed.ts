import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export default class CreateGames implements Seeder {
  /**
   * Track seeder execution.
   *
   * Default: false
   */
  track = false;

  public async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    const maxBetPerNumber = Number(process.env.MAX_BET_PER_NUMBER);

    const closeAt = new Date();
    if (closeAt.getHours() >= 19) {
      closeAt.setDate(closeAt.getDate() + 1);
    }
    closeAt.setHours(19, 0, 0, 0);

    for (let epoch = 0; epoch < 31; epoch++) {
      await dataSource
        .createQueryBuilder()
        .insert()
        .into('game')
        .values([{ epoch, maxBetPerNumber, closeAt, startDate: new Date(), endDate: new Date()}])
        .execute();

      closeAt.setDate(closeAt.getDate() + 1);
    }
  }
}
