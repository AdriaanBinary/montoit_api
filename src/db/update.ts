import MontoitDB from './pool.js';

interface UpdateDataPayload {
  user_id: string;
  anilist_id: string;
  [key: string]: unknown;
}

const updateData = {
  updateUserReadableContent: async function(data: UpdateDataPayload): Promise<boolean> {
    const { user_id, anilist_id, ...fields } = data;

    if (!user_id || !anilist_id) {
      throw new Error('user_id and anilist_id are required to update');
    }

    const entries = Object.entries(fields).filter(([_key, value]) => value !== undefined && value !== null);

    if (entries.length === 0) {
      throw new Error('No fields provided to update');
    }

    const setClauses = entries.map(([key], index) => `${key} = $${index + 1}`);
    const values = entries.map(([_key, value]) => value);
    const sql = `
      UPDATE readable_tracked_content
      SET ${setClauses.join(', ')}
      WHERE user_id = $${values.length + 1} AND anilist_id = $${values.length + 2}
    `;

    values.push(user_id, anilist_id);
    await MontoitDB.query(sql, values);
    return true;
  },

  updateUserWatchableContent: async function(data: UpdateDataPayload): Promise<boolean> {
    const { user_id, anilist_id, ...fields } = data;

    if (!user_id || !anilist_id) {
      throw new Error('user_id and anilist_id are required to update');
    }

    const entries = Object.entries(fields).filter(([_key, value]) => value !== undefined && value !== null);

    if (entries.length === 0) {
      throw new Error('No fields provided to update');
    }

    const setClauses = entries.map(([key], index) => `${key} = $${index + 1}`);
    const values = entries.map(([_key, value]) => value);
    const sql = `
      UPDATE watchable_tracked_content
      SET ${setClauses.join(', ')}
      WHERE user_id = $${values.length + 1} AND anilist_id = $${values.length + 2}
    `;

    values.push(user_id, anilist_id);
    await MontoitDB.query(sql, values);
    return true;
  }
};

export default updateData;
