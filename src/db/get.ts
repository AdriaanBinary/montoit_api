import MontoitDB from './pool.js';
import { checkPassword } from '../utils/passwordUtils.js';

export interface UserRecord {
  id: string;
  user_id?: string;
  username: string;
  email: string;
  password: string;
  created_at?: string;
  updated_at?: string;
}

const getData = {
  checkUsername: async function(username: string): Promise<boolean> {
    try {
      const result = await MontoitDB.query('SELECT 1 FROM users WHERE username = $1', [username]);
      return result.rows.length > 0;
    } catch (error: unknown) {
      console.error('Error checking username:', error);
      return false;
    }
  },

  checkEmail: async function(email: string): Promise<boolean> {
    try {
      const result = await MontoitDB.query('SELECT 1 FROM users WHERE email = $1', [email]);
      return result.rows.length > 0;
    } catch (error: unknown) {
      console.error('Error checking email:', error);
      return false;
    }
  },

  checkLogin: async function(email: string, password: string): Promise<UserRecord | null> {
    try {
      const result = await MontoitDB.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0] as UserRecord | undefined;

      if (!user) {
        return null;
      }

      const isValidPassword = await checkPassword(password, user.password);
      return isValidPassword ? user : null;
    } catch (error: unknown) {
      console.error('Error checking login credentials:', error);
      return null;
    }
  }
};

export default getData;
