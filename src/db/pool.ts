import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const DB_USER = process.env.DB_USER;
const DB_HOST = process.env.DB_HOST;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;

const MontoitDB = new Pool(
  process.env.NODE_ENV === 'PROD'
    ? {
        connectionString: DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      }
    : {
        user: DB_USER,
        host: DB_HOST,
        database: DB_NAME,
        password: DB_PASSWORD,
        port: DB_PORT,
        ssl: {
          rejectUnauthorized: false
        }
      }
);

MontoitDB.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
});

export default MontoitDB;
