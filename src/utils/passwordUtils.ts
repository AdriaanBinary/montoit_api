import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
  try {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  } catch (error: unknown) {
    console.error('Error hashing password:', error);
    throw error;
  }
}

export async function checkPassword(inputPassword: string, hashedPassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(inputPassword, hashedPassword);
  } catch (error: unknown) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}
