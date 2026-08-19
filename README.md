# Montoit API

TypeScript Express API for the Montoit project with PostgreSQL/Supabase integration.

**Author:** Adriaan

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your database credentials.

```bash
cp .env.example .env
```

**For Supabase Production:**
- Set `NODE_ENV=PROD`
- Set `DATABASE_URL` to your Supabase connection string
- Example: `postgresql://user:password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require`

**For Local Development:**
- Set `NODE_ENV=DEV`
- Fill in individual credentials: `DB_USER`, `DB_HOST`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`

### 3. Run the server

**Development mode (auto-reload):**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Run production build:**
```bash
npm start
```

The API will be available at `http://localhost:3000`.

## API Endpoints

### Health check
```
GET /health
```
Returns server status.

### Database connection test
```
GET /api/db-test
```
Tests the database connection.

### Autocomplete search
```
GET /api/autocomplete?q=<search_query>&limit=<limit>
```

**Parameters:**
- `q` (required): Search query (minimum 2 characters)
- `limit` (optional): Maximum results, default 8, max 50

### Public listings
```
GET /api/listings/public
```
Returns all public listings where status is `active` and `is_published` is true. This endpoint does not require authentication.

**Query parameters:**
- `page` (optional): Page number, default `1`
- `limit` (optional): Items per page, default `20`, max `100`
- `region_id` (optional): Repeatable region IDs to filter by, for example `region_id=1&region_id=2`
- `city_id` (optional): Repeatable city IDs to filter by
- `municipality_id` (optional): Repeatable municipality IDs to filter by
- `neighborhood_id` (optional): Repeatable neighborhood IDs to filter by
- `optionIds` (optional): Repeatable normalized Amenity or Security Option IDs
- `optionMatch` (optional): `any` (default) or `all`; controls how multiple `optionIds` are matched

Option filtering examples:

```text
# Match listings with at least one of options 1 or 2
GET /api/listings/public?optionIds=1&optionIds=2

# Match listings with both options 1 and 2
GET /api/listings/public?optionIds=1&optionIds=2&optionMatch=all
```

Option filtering is combined with other filters. For example, this finds active public listings in a price range with at least one requested option:

```text
GET /api/listings/public?minPrice=100000&maxPrice=500000&optionIds=1&optionIds=2
```

Unknown or inactive option IDs return no matching listings. They do not cause a `400` response.

**Response pagination format:**
```json
{
  "pagination": {
    "currentpage": 1,
    "pages": 7,
    "itemsPerPage": 20
  }
}
```

**Example:**
```
GET /api/autocomplete?q=Buea
GET /api/autocomplete?q=Yaounde&limit=10
```

### Listing Amenities and Security Options

The frontend should load the available normalized listing options before rendering the listing form:

```
GET /api/listings/options
```

This endpoint is public and returns active options grouped by category:

```json
{
  "success": true,
  "amenities": [
    {
      "id": 1,
      "name": "Built-in cupboards",
      "type": "AMENITY"
    }
  ],
  "security_options": [
    {
      "id": 2,
      "name": "24-hour security",
      "type": "SECURITY_OPTION"
    }
  ]
}
```

Use the option `id` values when creating or updating a listing. Both endpoints require authentication:

```
POST /api/listings
PUT /api/listings/:id
Authorization: Bearer <token>
```

Example request body:

```json
{
  "title": "Modern apartment",
  "amount": 250000,
  "option_ids": [1, 2]
}
```

`option_ids` is an array of positive integers. The API removes duplicate IDs and rejects IDs that do not exist or are inactive.

For `PUT /api/listings/:id`:

- Omit `option_ids` to leave the current normalized selections unchanged.
- Send `option_ids: []` to clear all normalized selections.
- Send a populated array to replace the complete normalized selection.

Listing responses include the selected normalized options in both ID and expanded forms:

```json
{
  "option_ids": [1, 2],
  "options": [
    {
      "id": 1,
      "name": "Built-in cupboards",
      "type": "AMENITY"
    },
    {
      "id": 2,
      "name": "24-hour security",
      "type": "SECURITY_OPTION"
    }
  ]
}
```

The existing `features` and `other` arrays remain available for backward compatibility. New frontend selections should use `option_ids`.

**Response:**
```json
{
  "success": true,
  "query": "Buea",
  "results": [
    {
      "name": "Buea",
      "type": "city",
      "id": 123
    }
  ],
  "count": 1
}
```

## Project Structure

```
montoit_api/
├── src/
│   ├── db/
│   │   ├── add.ts
│   │   ├── get.ts
│   │   ├── pool.ts
│   │   ├── queries.ts
│   │   └── update.ts
│   ├── routes/
│   │   ├── autocomplete.ts
│   │   └── auth/
│   │       ├── login.ts
│   │       └── register.ts
│   ├── utils/
│   │   └── passwordUtils.ts
│   └── index.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `DEV` or `PROD` |
| `DATABASE_URL` | Supabase connection string (PROD only) | `postgresql://...` |
| `DB_USER` | Database username (DEV only) | `postgres` |
| `DB_HOST` | Database host (DEV only) | `localhost` |
| `DB_PASSWORD` | Database password (DEV only) | `your_password` |
| `DB_NAME` | Database name (DEV only) | `postgres` |
| `DB_PORT` | Database port (DEV only) | `5432` |
| `PORT` | Server port | `3000` |

## Notes

- The project now uses TypeScript for safer typing and better maintainability.
- `npm run dev` starts the app with hot reload through `ts-node-dev`.
- `npm run build` compiles source files into `dist/`.
- The app uses parameterized queries to reduce SQL injection risk.
