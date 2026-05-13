import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

// Load environment variables
config();

export default {
  // Database dialect
  dialect: 'postgresql',
  
  // Database driver configuration
  driver: 'pg',
  
  // Database connection
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'nutricoach',
    password: process.env.DB_PASSWORD || 'nutricoach_secret',
    database: process.env.DB_NAME || 'nutricoach_db',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
  
  // Schema files location
  schema: './src/db/schema/index.ts',
  
  // Migration files output directory
  out: './src/db/migrations',
  
  // Verbose mode for debugging (disable in production)
  verbose: process.env.NODE_ENV !== 'production',
  
  // Strict mode - ensures type safety
  strict: true,
  
  // Migration configuration
  migrations: {
    table: 'drizzle_migrations',
    schema: 'public',
  },
} satisfies Config;
