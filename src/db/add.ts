import prisma from './prisma.js';
import { hashPassword } from '../utils/passwordUtils.js';
import getData from './get.js';

export interface CreatedUser {
  id: string;
  username: string;
  email: string;
  phone: string | null;
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
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  return existing ? generateUniqueUserId() : userId;
}

const addData = {
  addUser: async function(username: string, email: string, password: string, phone?: string): Promise<CreatedUser> {
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

    const user = await prisma.user.create({
      data: {
        id: userId,
        username,
        email,
        phone: typeof phone === 'string' && phone.trim().length > 0 ? phone.trim() : null,
        password: hashedPassword
      },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        created_at: true
      }
    });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at.toISOString()
    };
  }
};

export default addData;
