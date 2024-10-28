import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';
import { join } from 'path';
import 'dotenv/config';

const options: DataSourceOptions & SeederOptions = {
  type: process.env.DB_TYPE as any,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT as any,
  database: process.env.DB_DATABASE,
  synchronize: false,
  entities: [
    'dist/**/entities/*.entity{.ts,.js}',
    'dist/**/**/*.entity{.ts,.js}',
  ],
  seeds: ['src/database/seeds/*{.ts,.js}'],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  seedTracking: false,
  factories: ['src/database/factories/**/*{.ts,.js}'],
  extra: {
    queryTimeout: 5000,
  },
};

export const AppDataSource = new DataSource(options);
