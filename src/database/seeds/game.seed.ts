import { DataSource } from 'typeorm';
import { Factory, Seeder } from 'typeorm-seeding';

export default class CreateGame implements Seeder {
  public async run(factory: Factory, connection: DataSource): Promise<void> {
    await connection
      .createQueryBuilder()
      .insert()
      .into('game')
      .values([
        {
          epoch: 0,
        },
      ])
      .execute();
  }
}
