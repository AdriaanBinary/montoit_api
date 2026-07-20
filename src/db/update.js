const MontoitDB = require('./pool.js');

const updateData = {
    updateUserReadableContent: async function(data, callback) {
        try {
            const { user_id, anilist_id } = data;

            if (!user_id || !anilist_id) {
                return callback(new Error('user_id and anilist_id are required to update'), false);
            }

            const entries = Object.entries(data)
                .filter(([key, value]) =>
                    value !== undefined &&
                    value !== null &&
                    key !== 'user_id' &&
                    key !== 'anilist_id'
                );

            if (entries.length === 0) {
                return callback(new Error('No fields provided to update'), false);
            }

            const setClauses = entries.map(([key], index) => `${key} = $${index + 1}`);
            const values = entries.map(([_, value]) => value);

            const sql = `
                UPDATE readable_tracked_content
                SET ${setClauses.join(', ')}
                WHERE user_id = $${values.length + 1} AND anilist_id = $${values.length + 2}
            `;

            values.push(user_id, anilist_id);

            await MontoitDB.query(sql, values);

            callback(null, true);
        } catch (error) {
            console.error('Error updating user readable content:', error);
            callback(error, false);
        }
    },

    updateUserWatchableContent: async function(data, callback) {
        try {
            const { user_id, anilist_id } = data;

            if (!user_id || !anilist_id) {
                return callback(new Error('user_id and anilist_id are required to update'), false);
            }

            const entries = Object.entries(data)
                .filter(([key, value]) =>
                    value !== undefined &&
                    value !== null &&
                    key !== 'user_id' &&
                    key !== 'anilist_id'
                );

            if (entries.length === 0) {
                return callback(new Error('No fields provided to update'), false);
            }

            const setClauses = entries.map(([key], index) => `${key} = $${index + 1}`);
            const values = entries.map(([_, value]) => value);

            const sql = `
                UPDATE watchable_tracked_content
                SET ${setClauses.join(', ')}
                WHERE user_id = $${values.length + 1} AND anilist_id = $${values.length + 2}
            `;

            values.push(user_id, anilist_id);

            await MontoitDB.query(sql, values);

            callback(null, true);
        } catch (error) {
            console.error('Error updating user watchable content:', error);
            callback(error, false);
        }
    },


   
};

module.exports = updateData;