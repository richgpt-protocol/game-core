import { DataSource, DataSourceOptions } from 'typeorm';
import { SeederOptions } from 'typeorm-extension';

import * as dotenv from 'dotenv';
dotenv.config();

const options: DataSourceOptions & SeederOptions = {
  type: process.env.DB_TYPE as any,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT as any,
  database: process.env.DB_DATABASE,
  synchronize: true,
  entities: [
    'dist/**/entities/*.entity{.ts,.js}',
    'dist/**/**/*.entity{.ts,.js}',
  ],

  seeds: ['src/database/seeds/*{.ts,.js}'],
  // seeds: ['src/database/seeds/test.seed.ts'],
  seedTracking: false,
  factories: ['src/database/factories/**/*{.ts,.js}'],
  // extra: {
  //   queryTimeout: 5000,
  // },
};

export const dataSource = new DataSource(options);
