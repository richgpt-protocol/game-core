module.exports = {
  type: process.env.DB_TYPE,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [
    'dist/**/entities/*.entity{.ts,.js}',
    'dist/**/**/*.entity{.ts,.js}',
  ],
  seeds: ['src/database/seeds/*{.ts,.js}'],
  factories: ['src/database/factories/*{.ts,.js}'],
  migrations: ['src/database/migrations/*.ts'],
  cli: {
    migrationsDir: 'src/migrations',
  },
  synchronize: process.env.APP_ENV === 'dev',
  charset: 'utf8mb4',
};
