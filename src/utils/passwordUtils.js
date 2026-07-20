import bcrypt from 'bcrypt';

export async function hashPassword(password) {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    return hash;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw error;
  }
}

export async function checkPassword(inputPassword, hashedPassword) {
  try {
    const match = await bcrypt.compare(inputPassword, hashedPassword);
    return match;
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}
