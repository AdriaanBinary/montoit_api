import MontoitDB from './pool.js';
import { hashPassword } from '../utils/passwordUtils.js';
import getData from './get.js';

function generateUserId() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'u_';
    for (let i = 0; i < 10; i += 1) {
        id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return id;
}

async function generateUniqueUserId() {
    const userId = generateUserId();
    const existing = await MontoitDB.query('SELECT 1 FROM users WHERE user_id = $1 LIMIT 1', [userId]);
    if (existing.rows.length > 0) {
        return generateUniqueUserId();
    }
    return userId;
}

const addData = {
    addUser: async function(username, email, password, callback) {
        try {
            // Check if the username or email already exists
            const usernameExists = await getData.checkUsername(username);
            if (usernameExists) {
                callback('Username already exists', null);
                return;
            }

            const emailExists = await getData.checkEmail(email);
            if (emailExists) {
                callback('Email already exists', null);
                return;
            }

            const hashedPassword = await hashPassword(password);
            const userId = await generateUniqueUserId();
            const date = new Date();

            const insertSql = `
                INSERT INTO users (user_id, username, email, password, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $5)
                RETURNING user_id, username, email, created_at
            `;

            const result = await MontoitDB.query(insertSql, [userId, username, email, hashedPassword, date]);
            callback(null, result.rows[0]);
        } catch (error) {
            console.error('Error adding user:', error);
            callback(error, false);
        }
    },

};

export default addData;