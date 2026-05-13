# NutriCoach Backend - Configuration Setup

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

Required packages:
```bash
npm install express typescript dotenv zod pg drizzle-orm ioredis
npm install -D @types/node @types/express @types/pg drizzle-kit
```

### 2. Environment Setup

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and fill in your actual values:
```bash
# Generate secure JWT secrets
openssl rand -base64 32
```

### 3. Start Docker Services

Start PostgreSQL and Redis:
```bash
docker-compose up -d
```

Verify services are running:
```bash
docker-compose ps
```

### 4. Run Database Migrations

Generate migrations from your schema:
```bash
npx drizzle-kit generate
```

Apply migrations:
```bash
npx drizzle-kit migrate
```

Or use the migrate script:
```bash
npm run db:migrate
```

### 5. Start Development Server

```bash
npm run dev
```

---

## 📁 File Structure

```
nutricoach-backend/
├── docker-compose.yml          # Docker services (PostgreSQL, Redis)
├── drizzle.config.ts          # Drizzle ORM configuration
├── .env.example               # Environment variables template
├── .env                       # Your actual environment variables (create this)
└── src/
    └── config/
        ├── env.ts             # Environment validation with Zod
        ├── db.ts              # PostgreSQL connection with Drizzle
        └── redis.ts           # Redis client with ioredis
```

---

## 🐳 Docker Services

### PostgreSQL 18
- **Port:** 5432 (default)
- **Volume:** `postgres_data` (persistent storage)
- **Healthcheck:** Automated connection verification
- **Resources:** 2GB RAM limit, 1-2 CPUs

### Redis 7
- **Port:** 6379 (default)
- **Volume:** `redis_data` (persistent cache)
- **Authentication:** Password-protected
- **Resources:** 512MB RAM limit

### Useful Docker Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Restart a service
docker-compose restart postgres

# Remove volumes (⚠️ deletes all data)
docker-compose down -v
```

---

## 🗄️ Database Management

### Drizzle Kit Commands

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Open Drizzle Studio (GUI)
npx drizzle-kit studio

# Pull schema from existing database
npx drizzle-kit pull

# Push schema to database (dev only)
npx drizzle-kit push
```

### Direct PostgreSQL Access

```bash
# Connect to PostgreSQL container
docker exec -it nutricoach-postgres psql -U nutricoach -d nutricoach_db

# Or using psql from host
psql -h localhost -p 5432 -U nutricoach -d nutricoach_db
```

---

## 🔴 Redis Management

### Redis CLI Access

```bash
# Connect to Redis container
docker exec -it nutricoach-redis redis-cli

# Authenticate (if password is set)
AUTH redis_secret

# Test connection
PING
# Should return: PONG

# View all keys
KEYS *

# Get a value
GET mykey

# Flush all data (⚠️ use with caution)
FLUSHDB
```

### Using Redis in Code

The `redis.ts` config provides a convenient cache wrapper:

```typescript
import { cache } from './config/redis';

// Store data (1 hour TTL by default)
await cache.set('user:123', { name: 'John', age: 30 });

// Retrieve data
const user = await cache.get<{ name: string; age: number }>('user:123');

// Delete data
await cache.del('user:123');

// Check if exists
const exists = await cache.exists('user:123');
```

---

## 🔒 Security Best Practices

### 1. JWT Secrets
- **Minimum 32 characters**
- Use `openssl rand -base64 32` to generate
- Never commit to version control
- Rotate regularly in production

### 2. Database Password
- Use strong, unique passwords
- Different for each environment
- Store in secrets manager for production

### 3. Redis Password
- Enable authentication in production
- Use `requirepass` directive
- Format: `redis://:password@host:port`

### 4. Environment Variables
- Never commit `.env` files
- Use `.env.example` as template
- Different credentials per environment
- Use Docker secrets for production

---

## 🔍 Connection Testing

The config files include connection test functions:

```typescript
import { testConnection } from './config/db';
import { testRedisConnection } from './config/redis';

// Test database
await testConnection();

// Test Redis
await testRedisConnection();
```

Add these to your `server.ts` startup:

```typescript
import { testConnection, closeConnection } from './config/db';
import { testRedisConnection, closeRedisConnection } from './config/redis';

async function startServer() {
  // Test connections
  const dbOk = await testConnection();
  const redisOk = await testRedisConnection();
  
  if (!dbOk || !redisOk) {
    console.error('Failed to connect to required services');
    process.exit(1);
  }
  
  // Start Express server
  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⚠️  SIGTERM received, shutting down gracefully...');
  await closeConnection();
  await closeRedisConnection();
  process.exit(0);
});
```

---

## 📊 Monitoring

### Health Check Endpoints

Create these endpoints in your Express app:

```typescript
// Health check
app.get('/health', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'ok'
  };
  res.json(health);
});

// Database check
app.get('/health/db', async (req, res) => {
  try {
    const result = await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// Redis check
app.get('/health/redis', async (req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ status: 'ok', redis: pong === 'PONG' ? 'connected' : 'disconnected' });
  } catch (error) {
    res.status(503).json({ status: 'error', redis: 'disconnected' });
  }
});
```

---

## 🐛 Troubleshooting

### PostgreSQL Issues

**"Connection refused"**
```bash
# Check if container is running
docker-compose ps

# Check logs
docker-compose logs postgres

# Restart service
docker-compose restart postgres
```

**"Authentication failed"**
- Verify credentials in `.env` match `docker-compose.yml`
- Check `DB_USER`, `DB_PASSWORD`, `DB_NAME`

### Redis Issues

**"Connection timeout"**
```bash
# Test Redis directly
docker exec -it nutricoach-redis redis-cli ping

# Check if password is required
docker exec -it nutricoach-redis redis-cli
# Then: AUTH your_password
```

**"NOAUTH Authentication required"**
- Add password to REDIS_URL: `redis://:password@localhost:6379`

### Environment Variable Issues

**"Validation failed"**
- Check `.env` file exists
- Verify all required variables are set
- Ensure JWT_SECRET is at least 32 characters
- REDIS_URL must be valid URL format

---

## 📦 Production Deployment

### Using docker-compose.prod.yml

Create production override:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Environment Variables

Use environment-specific files:
- `.env.development`
- `.env.staging`
- `.env.production`

Or use Docker secrets/Kubernetes ConfigMaps.

### SSL/TLS

Enable SSL for database and Redis in production:
```typescript
// Already configured in config files
ssl: env.NODE_ENV === 'production' 
  ? { rejectUnauthorized: false }
  : undefined
```

---

## 🎯 Next Steps

1. ✅ Set up environment variables
2. ✅ Start Docker services
3. ✅ Test connections
4. 📝 Create database schema files
5. 🔄 Run migrations
6. 🚀 Start building your API endpoints

---

## 📚 Additional Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

---

## 🆘 Need Help?

If you encounter any issues:
1. Check the logs: `docker-compose logs`
2. Verify your `.env` configuration
3. Ensure Docker services are running
4. Review the troubleshooting section above
