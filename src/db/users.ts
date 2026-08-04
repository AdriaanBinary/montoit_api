import prisma from './prisma.js';

function toRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toRecords(values: unknown[]): Record<string, unknown>[] {
  return values.map((value) => toRecord(value));
}

const usersDb = {
  ensureUserFavoritesTable: async function(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT unique_user_favorite_listing UNIQUE (user_id, listing_id)
      )
    `);
  },

  upsertFavoriteListing: async function(userId: string, listingId: number): Promise<Record<string, unknown>> {
    const favorite = await prisma.userFavorite.upsert({
      where: {
        user_id_listing_id: {
          user_id: userId,
          listing_id: listingId
        }
      },
      create: {
        user_id: userId,
        listing_id: listingId
      },
      update: {
        updated_at: new Date()
      }
    });

    return toRecord(favorite);
  },

  removeFavoriteListing: async function(userId: string, listingId: number): Promise<number> {
    const result = await prisma.userFavorite.deleteMany({
      where: {
        user_id: userId,
        listing_id: listingId
      }
    });

    return result.count;
  },

  countFavoriteListings: async function(userId: string): Promise<number> {
    return prisma.userFavorite.count({
      where: {
        user_id: userId,
        listing: {
          status: 'active',
          is_published: true,
          deleted_at: null
        }
      }
    });
  },

  getFavoriteListingIds: async function(userId: string, limit: number, offset: number): Promise<number[]> {
    const favorites = await prisma.userFavorite.findMany({
      where: {
        user_id: userId,
        listing: {
          status: 'active',
          is_published: true,
          deleted_at: null
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: limit,
      skip: offset,
      select: {
        listing_id: true
      }
    });

    return favorites
      .map((favorite) => favorite.listing_id)
      .filter((listingId): listingId is number => Number.isInteger(listingId));
  },

  getFavoriteRecords: async function(userId: string): Promise<Record<string, unknown>[]> {
    const favorites = await prisma.userFavorite.findMany({
      where: {
        user_id: userId
      }
    });

    return toRecords(favorites);
  }
};

export default usersDb;