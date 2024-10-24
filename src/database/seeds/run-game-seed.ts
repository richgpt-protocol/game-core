import { AppDataSource as dataSource } from '../../../src/data-source'; // Adjust path
import CreateGames from './game.seed'; // Adjust path to seeder

const runSeeder = async () => {
  await dataSource.initialize();
  const seeder = new CreateGames();
  await seeder.run(dataSource, {} as any);
  console.log('CreateGames seeder has run successfully.');
  await dataSource.destroy();
};

runSeeder().catch((err) => console.error('Error running seeder:', err));
