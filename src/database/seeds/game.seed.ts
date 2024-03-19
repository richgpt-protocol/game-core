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
    const maxBetAmount = Number(process.env.MAX_BET_AMOUNT);
    const minBetAmount = Number(process.env.MIN_BET_AMOUNT);

    let startDate = new Date();
    let endDate = new Date();
    if (startDate.getHours() >= 19) {
      endDate.setDate(startDate.getDate() + 1);
    }
    endDate.setHours(18, 59, 0, 0);

    for (let epoch = 0; epoch < 31; epoch++) {
      await dataSource
        .createQueryBuilder()
        .insert()
        .into('game')
        .values([{
          epoch: epoch.toString(),
          maxBetAmount: maxBetAmount,
          minBetAmount: minBetAmount,
          drawTxHash: '',
          startDate: startDate,
          endDate: endDate,
          isClosed: false,
        }])
        .execute();

      startDate.setDate(endDate.getDate());
      startDate.setHours(19, 0, 0, 0);
      endDate.setDate(endDate.getDate() + 1);
    }
  }
}
