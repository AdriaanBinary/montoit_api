import MontoitDB from './pool.js';
import { hashPassword } from '../utils/passwordUtils.js';
import getData from './get.js';

export interface CreatedUser {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

function generateUserId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'u_';
  for (let i = 0; i < 10; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

async function generateUniqueUserId(): Promise<string> {
  const userId = generateUserId();
  const existing = await MontoitDB.query('SELECT 1 FROM users WHERE id = $1 LIMIT 1', [userId]);
  return existing.rows.length > 0 ? generateUniqueUserId() : userId;
}

const addData = {
  addUser: async function(username: string, email: string, password: string): Promise<CreatedUser> {
    const usernameExists = await getData.checkUsername(username);
    if (usernameExists) {
      throw new Error('Username already exists');
    }

    const emailExists = await getData.checkEmail(email);
    if (emailExists) {
      throw new Error('Email already exists');
    }

    const hashedPassword = await hashPassword(password);
    const userId = await generateUniqueUserId();
    const date = new Date();

    const insertSql = `
      INSERT INTO users (id, username, email, password, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING id, username, email, created_at
    `;

    const result = await MontoitDB.query(insertSql, [userId, username, email, hashedPassword, date]);
    return result.rows[0] as CreatedUser;
  }
};

export default addData;
