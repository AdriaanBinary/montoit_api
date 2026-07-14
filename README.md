# Montoit API

Express.js API for Montoit project with PostgreSQL/Supabase integration.

**Author:** Adriaan

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your database credentials:

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

### 3. Run the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /health
```
Returns server status.

### Database Connection Test
```
GET /api/db-test
```
Tests the database connection.

### Autocomplete Search
```
GET /api/autocomplete?q=<search_query>&limit=<limit>
```

**Parameters:**
- `q` (required): Search query (minimum 2 characters)
- `limit` (optional): Maximum results, default 8, max 50

**Example:**
```
GET /api/autocomplete?q=Buea
GET /api/autocomplete?q=Yaounde&limit=10
```

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
│   │   ├── pool.js          # Database connection pool
│   │   └── queries.js       # Database query functions
│   ├── routes/
│   │   └── autocomplete.js  # Autocomplete endpoint
│   └── index.js             # Main Express app
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore rules
├── package.json             # Project dependencies
└── README.md                # This file
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment (PROD or DEV) | `DEV` |
| `DATABASE_URL` | Supabase connection string (PROD only) | `postgresql://...` |
| `DB_USER` | Database username (DEV only) | `postgres` |
| `DB_HOST` | Database host (DEV only) | `aws-0-eu-west-1.pooler.supabase.com` |
| `DB_PASSWORD` | Database password (DEV only) | `your_password` |
| `DB_NAME` | Database name (DEV only) | `postgres` |
| `DB_PORT` | Database port (DEV only) | `6543` |
| `PORT` | Server port | `3000` |

## Notes

- SSL is enabled by default for Supabase connections
- The API uses parameterized queries to prevent SQL injection
- All timestamps are in UTC
