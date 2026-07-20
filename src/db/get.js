import MontoitDB from './pool.js';
import { checkPassword } from '../utils/passwordUtils.js';

const getData = {
  // checks if username already exists
  checkUsername: async function(username) {
    try {
      const result = await MontoitDB.query('SELECT * FROM users WHERE username = $1', [username]);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking username:', error);
      return false;
    }
  },

  // checks if email already exists
  checkEmail: async function(email) {
    try {
      const result = await MontoitDB.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking email:', error);
      return false;
    }
  },

  checkLogin: function(email, password, callback) {
    MontoitDB.query('SELECT * FROM users WHERE email = $1', [email], async (err, res) => {
      if (err) {
        console.error('Error checking login credentials:', err);
        callback(err, false);
        return;
      }

      if (!checkPassword) {
        console.error('checkPassword function is undefined');
        callback(new Error('Authentication system error'), false);
        return;
      }

      if (res.rows.length > 0) {
        const isValidPassword = await checkPassword(password, res.rows[0].password);
        if (isValidPassword) {
          callback(null, res.rows[0]);
        } else {
          callback(null, false);
        }
      } else {
        callback(null, false);
      }
    });
  }
};

export default getData;
