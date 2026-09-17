import prisma from './prisma.js';
import { checkPassword } from '../utils/passwordUtils.js';
import { normalizeEmail } from '../utils/emailUtils.js';

export interface UserRecord {
  id: string;
  user_id?: string;
  username: string;
  email: string;
  phone: string | null;
  role: 'PRIVATE' | 'AGENT' | 'AGENCY_OWNER' | 'ADMIN';
  password: string;
  email_verified: boolean;
  created_at?: string;
  updated_at?: string;
}

const getData = {
  checkUsername: async function(username: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true }
      });

      return Boolean(user);
    } catch (error: unknown) {
      console.error('Error checking username:', error);
      return false;
    }
  },

  checkEmail: async function(email: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: { id: true }
      });

      return Boolean(user);
    } catch (error: unknown) {
      console.error('Error checking email:', error);
      return false;
    }
  },

  checkLogin: async function(email: string, password: string): Promise<UserRecord | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          password: true,
          email_verified: true,
          created_at: true,
          updated_at: true
        }
      });

      if (!user) {
        return null;
      }

      if (!user.password) {
        return null;
      }

      const storedPassword = user.password;

      const mappedUser: UserRecord = {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        password: storedPassword,
        email_verified: user.email_verified,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString()
      };

      const isValidPassword = await checkPassword(password, mappedUser.password);
      return isValidPassword ? mappedUser : null;
    } catch (error: unknown) {
      console.error('Error checking login credentials:', error);
      return null;
    }
  }
};

export default getData;
