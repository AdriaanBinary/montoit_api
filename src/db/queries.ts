import prisma from './prisma.js';

export interface Suggestion {
  name: string;
  type: string;
  id: string;
}

const queries = {
  getTopSuggestions: async function(userInput: string, limit = 8): Promise<Suggestion[]> {
    const cleanInput = userInput.trim();
    if (cleanInput.length < 2) return [];

    try {
      const query = `
        WITH combined_search AS (
          SELECT r.name AS display_name, 'region' AS type, r.id AS id, 1 AS sort_weight
          FROM regions r
          WHERE r.name ILIKE $1

          UNION ALL

          SELECT CONCAT(c.name, '.', r.name) AS display_name, 'city' AS type, c.id AS id, 2 AS sort_weight
          FROM cities c
          JOIN regions r ON c.region_id = r.id
          WHERE c.name ILIKE $1

          UNION ALL

          SELECT CONCAT(m.name, '.', c.name, '.', r.name) AS display_name, 'municipality' AS type, m.id AS id, 3 AS sort_weight
          FROM municipalities m
          JOIN cities c ON m.city_id = c.id
          JOIN regions r ON c.region_id = r.id
          WHERE m.name ILIKE $1

          UNION ALL

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

      const rows = await prisma.$queryRawUnsafe<Array<{ name: string; type: string; id: string | number }>>(
        query,
        `%${cleanInput}%`,
        cleanInput,
        limit
      );

      return rows.map((row) => ({
        name: row.name,
        type: row.type,
        id: String(row.id)
      }));
    } catch (err: unknown) {
      console.error('Database search failed:', err);
      return [];
    }
  }
};

export default queries;
