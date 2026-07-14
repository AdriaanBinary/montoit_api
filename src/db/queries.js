import MontoitDB from './pool.js';

const queries = {
    // Generic update function
    updateData: async function(tableName, data, whereClause, callback) {
        try {
            const entries = Object.entries(data)
                .filter(([key, value]) =>
                    value !== undefined && value !== null
                );

            if (entries.length === 0) {
                return callback(new Error('No fields provided to update'), false);
            }

            const setClauses = entries.map(([key], index) => `${key} = $${index + 1}`);
            const values = entries.map(([_, value]) => value);

            const sql = `
                UPDATE ${tableName}
                SET ${setClauses.join(', ')}
                WHERE ${whereClause}
            `;

            await MontoitDB.query(sql, values);
            callback(null, true);
        } catch (error) {
            console.error(`Error updating ${tableName}:`, error);
            callback(error, false);
        }
    },

    // Get suggestions based on search query
    getTopSuggestions: async function(userInput, limit = 8) {
        const cleanInput = userInput.trim();
        if (cleanInput.length < 2) return [];

        try {
            const query = `
                WITH combined_search AS (
                    -- Tier 1: Search Regions
                    SELECT 
                        r.name AS display_name,
                        'region' AS type,
                        r.id AS id,
                        1 AS sort_weight
                    FROM regions r
                    WHERE r.name ILIKE $1

                    UNION ALL

                    -- Tier 2: Search Cities (Format: city.region)
                    SELECT 
                        CONCAT(c.name, '.', r.name) AS display_name,
                        'city' AS type,
                        c.id AS id,
                        2 AS sort_weight
                    FROM cities c
                    JOIN regions r ON c.region_id = r.id
                    WHERE c.name ILIKE $1

                    UNION ALL

                    -- Tier 3: Search Municipalities (Format: municipality.city.region)
                    SELECT 
                        CONCAT(m.name, '.', c.name, '.', r.name) AS display_name,
                        'municipality' AS type,
                        m.id AS id,
                        3 AS sort_weight
                    FROM municipalities m
                    JOIN cities c ON m.city_id = c.id
                    JOIN regions r ON c.region_id = r.id
                    WHERE m.name ILIKE $1

                    UNION ALL

                    -- Tier 4: Search Neighborhoods (Format: neighborhood.municipality.city.region)
                    SELECT 
                        CASE 
                            WHEN n.name NOT ILIKE $1 THEN CONCAT((SELECT val FROM unnest(n.aliases) val WHERE val ILIKE $1 LIMIT 1), ' (', n.name, ').', m.name, '.', c.name, '.', r.name)
                            ELSE CONCAT(n.name, '.', m.name, '.', c.name, '.', r.name)
                        END AS display_name,
                        'neighborhood' AS type,
                        n.id AS id,
                        4 AS sort_weight
                    FROM neighborhoods n
                    JOIN municipalities m ON n.municipality_id = m.id
                    JOIN cities c ON m.city_id = c.id
                    JOIN regions r ON c.region_id = r.id
                    WHERE n.name ILIKE $1 OR n.aliases @> ARRAY[$2]::text[]
                )
                SELECT display_name AS name, type, id 
                FROM combined_search
                ORDER BY sort_weight ASC, name ASC
                LIMIT $3;
            `;

            const res = await MontoitDB.query(query, [`%${cleanInput}%`, cleanInput, limit]);
            return res.rows;
        } catch (err) {
            console.error("Database search failed:", err);
            if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') {
                console.error("Check that the database host resolves, that your network can reach it, and that DATABASE_URL is set correctly.");
            }
            return [];
        }
    },

    // Execute a generic query
    query: async function(sql, values) {
        try {
            const res = await MontoitDB.query(sql, values);
            return { success: true, data: res.rows };
        } catch (error) {
            console.error('Query execution error:', error);
            return { success: false, error: error.message };
        }
    }
};

export default queries;
