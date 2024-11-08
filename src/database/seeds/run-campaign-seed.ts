import { dataSource } from '../data-source'; // Adjust path
import CreateCampaigns from './campaign.seed';

const runSeeder = async () => {
  await dataSource.initialize();
  const seeder = new CreateCampaigns();
  await seeder.run(dataSource, {} as any);
  console.log('CreateCampaigns seeder has run successfully.');
  await dataSource.destroy();
};

runSeeder().catch((err) => console.error('Error running seeder:', err));
