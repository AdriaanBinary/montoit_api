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
