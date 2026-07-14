import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

let MontoitDB;
const DATABASE_URL = process.env.DATABASE_URL;
const DB_USER = process.env.DB_USER;
const DB_HOST = process.env.DB_HOST;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = process.env.DB_PORT;

if (process.env.NODE_ENV === 'PROD') {
    console.log('Connecting to production database');
    MontoitDB = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
} else {
    console.log('Connecting to local/development database');
    MontoitDB = new Pool({
        user: DB_USER,
        host: DB_HOST,
        database: DB_NAME,
        password: DB_PASSWORD,
        port: DB_PORT,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

// Handle pool errors
MontoitDB.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

export default MontoitDB;
