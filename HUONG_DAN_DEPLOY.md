# 🚀 Hướng Dẫn Deploy NutriCoach Backend
## Windows (VSCode + Git Bash) + PostgreSQL trên Ubuntu VM

---

## 📋 Mục Lục
1. [Chuẩn Bị Môi Trường](#1-chuẩn-bị-môi-trường)
2. [Setup PostgreSQL trên Ubuntu VM](#2-setup-postgresql-trên-ubuntu-vm)
3. [Setup Project trên Windows](#3-setup-project-trên-windows)
4. [Cấu Hình Kết Nối](#4-cấu-hình-kết-nối)
5. [Chạy Database Migrations](#5-chạy-database-migrations)
6. [Khởi Động Server](#6-khởi-động-server)
7. [Testing & Debugging](#7-testing--debugging)
8. [Deploy Production](#8-deploy-production)

---

## 1. Chuẩn Bị Môi Trường

### ✅ Checklist Trước Khi Bắt Đầu
- [ ] Visual Studio Code đã cài đặt
- [ ] Git Bash đã cài đặt
- [ ] Node.js đã cài đặt (v18 hoặc v20 LTS)
- [ ] PostgreSQL 18 đang chạy trên Ubuntu VM
- [ ] Claude Pro đã đăng ký

### 📦 Cài Đặt Node.js trên Windows

**Kiểm tra Node.js:**
```bash
node -v
# Cần v18.x hoặc v20.x
```

**Nếu chưa có, tải tại:** https://nodejs.org/

### 🔧 Cài Đặt Extensions cho VSCode

Mở VSCode và cài các extensions sau:
- **ESLint** - Linting cho TypeScript
- **Prettier** - Code formatting
- **Remote - SSH** (optional) - Kết nối đến Ubuntu VM
- **Thunder Client** hoặc **REST Client** - Test API

---

## 2. Setup PostgreSQL trên Ubuntu VM

### 🐘 Bước 1: Kết Nối Vào Ubuntu VM

**Từ Git Bash trên Windows:**
```bash
# Thay YOUR_VM_IP bằng IP của VM Ubuntu
ssh username@YOUR_VM_IP
```

**Hoặc dùng Remote - SSH trong VSCode**

### 🔧 Bước 2: Cấu Hình PostgreSQL

**Kiểm tra PostgreSQL đang chạy:**
```bash
sudo systemctl status postgresql
```

**Nếu chưa chạy, khởi động:**
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Tự động chạy khi boot
```

### 👤 Bước 3: Tạo Database và User

**Vào PostgreSQL shell:**
```bash
sudo -u postgres psql
```

**Trong PostgreSQL shell, chạy các lệnh sau:**
```sql
-- Tạo user cho NutriCoach
CREATE USER nutricoach WITH PASSWORD 'nutricoach_secret_2024';

-- Tạo database
CREATE DATABASE nutricoach_db;

-- Cấp quyền cho user
GRANT ALL PRIVILEGES ON DATABASE nutricoach_db TO nutricoach;

-- Kết nối vào database
\c nutricoach_db

-- Cấp quyền schema public
GRANT ALL ON SCHEMA public TO nutricoach;

-- Kiểm tra
\l
\du

-- Thoát
\q
```

### 🌐 Bước 4: Cho Phép Kết Nối Từ Xa

**Sửa file `postgresql.conf`:**
```bash
sudo nano /etc/postgresql/18/main/postgresql.conf
```

**Tìm và sửa dòng:**
```conf
# Cho phép kết nối từ tất cả IP
listen_addresses = '*'
```

**Sửa file `pg_hba.conf`:**
```bash
sudo nano /etc/postgresql/18/main/pg_hba.conf
```

**Thêm dòng này vào cuối file:**
```conf
# Cho phép kết nối từ Windows (thay YOUR_WINDOWS_IP)
host    all             all             YOUR_WINDOWS_IP/32      md5
# Hoặc cho phép tất cả (chỉ dùng trong development)
host    all             all             0.0.0.0/0               md5
```

**Khởi động lại PostgreSQL:**
```bash
sudo systemctl restart postgresql
```

### 🔥 Bước 5: Mở Firewall (nếu có)

```bash
# Cho phép port 5432
sudo ufw allow 5432/tcp

# Kiểm tra status
sudo ufw status
```

### ✅ Bước 6: Test Kết Nối Từ Windows

**Từ Git Bash trên Windows:**
```bash
# Thay YOUR_VM_IP bằng IP của Ubuntu VM
psql -h YOUR_VM_IP -p 5432 -U nutricoach -d nutricoach_db
# Nhập password: nutricoach_secret_2024

# Nếu kết nối thành công, thử query:
SELECT version();

# Thoát
\q
```

---

## 3. Setup Project trên Windows

### 📁 Bước 1: Tạo Thư Mục Project

**Mở Git Bash:**
```bash
# Chọn nơi lưu project (ví dụ: D:\Projects)
cd /d/Projects

# Tạo folder mới
mkdir nutricoach-backend
cd nutricoach-backend
```

### 🎯 Bước 2: Khởi Tạo Project

```bash
# Khởi tạo npm project
npm init -y

# Cài đặt TypeScript và công cụ build
npm install -D typescript @types/node ts-node nodemon
npm install -D @types/express

# Khởi tạo tsconfig.json
npx tsc --init
```

### 📦 Bước 3: Cài Đặt Dependencies

**Core dependencies:**
```bash
npm install express dotenv zod
```

**Database:**
```bash
npm install pg drizzle-orm
npm install -D @types/pg drizzle-kit
```

**Redis (chạy trên Windows với Docker Desktop hoặc WSL):**
```bash
npm install ioredis
npm install -D @types/ioredis
```

**Authentication:**
```bash
npm install bcrypt jsonwebtoken
npm install -D @types/bcrypt @types/jsonwebtoken
```

**Validation & Middleware:**
```bash
npm install cors helmet express-rate-limit morgan multer
npm install -D @types/cors @types/morgan @types/multer
```

**OpenAI (cho AI features):**
```bash
npm install openai
```

**PayOS (payment):**
```bash
npm install @payos/node
```

### 📂 Bước 4: Tạo Cấu Trúc Thư Mục

**Tạo tất cả folders cần thiết:**
```bash
mkdir -p src/{config,db/{schema,migrations},modules/{auth,users,nutrition,scan,workout,pt,payment,content,dashboard},middlewares,lib,scrapers,jobs,types,utils}

# Tạo file gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json

# Environment
.env
.env.local
.env.*.local

# Build
dist/
build/

# Logs
logs/
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Uploads
uploads/
temp/
EOF
```

### 📄 Bước 5: Copy Config Files

**Từ folder đã tải từ Claude, copy vào project:**
```bash
# Copy tất cả config files vào project
cp /path/to/downloaded/nutricoach-config/* ./ -r
```

**Hoặc tạo thủ công trong VSCode:**
- Mở VSCode: `code .`
- Copy nội dung từ các file đã tải
- Paste vào đúng vị trí theo cấu trúc

### ⚙️ Bước 6: Cấu Hình TypeScript

**Sửa `tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 📝 Bước 7: Cấu Hình NPM Scripts

**Sửa `package.json`:**
```json
{
  "scripts": {
    "dev": "nodemon src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio",
    "db:push": "drizzle-kit push"
  }
}
```

**Cài thêm tsx để chạy TypeScript:**
```bash
npm install -D tsx
```

---

## 4. Cấu Hình Kết Nối

### 🔐 Bước 1: Tạo File .env

**Tạo file `.env` trong root folder:**
```bash
# Copy từ template
cp .env.example .env
```

**Mở `.env` trong VSCode và điền thông tin:**
```env
# ===================================
# NutriCoach Backend Environment
# ===================================

# Application
NODE_ENV=development
PORT=3000

# Database (PostgreSQL trên Ubuntu VM)
DB_HOST=YOUR_VM_IP          # Thay bằng IP của Ubuntu VM
DB_PORT=5432
DB_USER=nutricoach
DB_PASSWORD=nutricoach_secret_2024
DB_NAME=nutricoach_db

# Redis (Local hoặc Docker)
REDIS_URL=redis://localhost:6379

# JWT Secrets (Generate mới)
JWT_SECRET=generate-your-secret-key-min-32-chars-here
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=generate-your-refresh-secret-key-here
JWT_REFRESH_EXPIRES_IN=30d

# OpenAI API
OPENAI_API_KEY=sk-proj-your-key-here

# PayOS
PAYOS_CLIENT_ID=your-client-id
PAYOS_API_KEY=your-api-key
PAYOS_CHECKSUM_KEY=your-checksum-key

# Storage
STORAGE_TYPE=local
STORAGE_PATH=./uploads

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Logging
LOG_LEVEL=debug
```

### 🔑 Bước 2: Generate JWT Secrets

**Trong Git Bash:**
```bash
# Generate strong secrets
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Copy kết quả vào JWT_SECRET

node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Copy kết quả vào JWT_REFRESH_SECRET
```

### 🔴 Bước 3: Setup Redis

**Option 1: Dùng Docker Desktop (Recommended)**
```bash
# Install Docker Desktop for Windows
# Sau đó chạy Redis container:
docker run -d --name nutricoach-redis -p 6379:6379 redis:7-alpine
```

**Option 2: Cài Redis trên Windows**
- Download từ: https://github.com/microsoftarchive/redis/releases
- Giải nén và chạy `redis-server.exe`

**Option 3: Dùng Redis trên Ubuntu VM**
```bash
# SSH vào Ubuntu VM
ssh username@YOUR_VM_IP

# Cài Redis
sudo apt update
sudo apt install redis-server -y

# Khởi động Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test
redis-cli ping
# Phải trả về: PONG
```

**Nếu dùng Redis trên VM, update .env:**
```env
REDIS_URL=redis://YOUR_VM_IP:6379
```

---

## 5. Chạy Database Migrations

### 📊 Bước 1: Tạo Schema Files

**Tạo file `src/db/schema/users.schema.ts`:**
```typescript
import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'), // user, pt, admin
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

**Tạo file `src/db/schema/index.ts`:**
```typescript
export * from './users.schema';
// Export các schema khác khi tạo
```

### 🔄 Bước 2: Generate Migrations

```bash
# Generate migration files từ schema
npm run db:generate
```

### 📝 Bước 3: Tạo Migration Runner

**Tạo file `src/db/migrate.ts`:**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env';

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

const db = drizzle(pool);

async function runMigrations() {
  console.log('🔄 Running migrations...');
  
  try {
    await migrate(db, { migrationsFolder: './src/db/migrations' });
    console.log('✅ Migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  await pool.end();
  process.exit(0);
}

runMigrations();
```

### ▶️ Bước 4: Chạy Migrations

```bash
npm run db:migrate
```

**Kết quả mong đợi:**
```
🔄 Running migrations...
✅ Migrations completed successfully!
```

### ✅ Bước 5: Verify Database

**Kết nối vào PostgreSQL và kiểm tra:**
```bash
psql -h YOUR_VM_IP -U nutricoach -d nutricoach_db
```

```sql
-- Xem các tables đã tạo
\dt

-- Xem cấu trúc table users
\d users

-- Thoát
\q
```

---

## 6. Khởi Động Server

### 🚀 Bước 1: Tạo Server Entry Point

**Tạo file `src/app.ts`:**
```typescript
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
  origin: env.CORS_ORIGIN.split(','),
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'NutriCoach API',
    version: '1.0.0',
    status: 'running',
  });
});

export default app;
```

**Tạo file `src/server.ts`:**
```typescript
import app from './app';
import { env } from './config/env';
import { testConnection, closeConnection } from './config/db';
import { testRedisConnection, closeRedisConnection } from './config/redis';

async function startServer() {
  try {
    // Test database connection
    console.log('🔄 Testing database connection...');
    const dbOk = await testConnection();
    
    if (!dbOk) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }
    
    // Test Redis connection
    console.log('🔄 Testing Redis connection...');
    const redisOk = await testRedisConnection();
    
    if (!redisOk) {
      console.error('❌ Failed to connect to Redis');
      process.exit(1);
    }
    
    // Start Express server
    const server = app.listen(env.PORT, () => {
      console.log('');
      console.log('🚀 ===================================');
      console.log(`🚀 NutriCoach API Server is running!`);
      console.log(`🚀 Environment: ${env.NODE_ENV}`);
      console.log(`🚀 URL: http://localhost:${env.PORT}`);
      console.log(`🚀 Health: http://localhost:${env.PORT}/health`);
      console.log('🚀 ===================================');
      console.log('');
    });
    
    // Graceful shutdown
    const shutdown = async () => {
      console.log('');
      console.log('⚠️  Shutting down gracefully...');
      
      server.close(async () => {
        await closeConnection();
        await closeRedisConnection();
        console.log('✅ Server closed');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.error('❌ Forced shutdown');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

### 🔧 Bước 2: Cấu Hình Nodemon

**Tạo file `nodemon.json`:**
```json
{
  "watch": ["src"],
  "ext": "ts,json",
  "ignore": ["src/**/*.spec.ts", "src/**/*.test.ts"],
  "exec": "tsx src/server.ts",
  "env": {
    "NODE_ENV": "development"
  }
}
```

### ▶️ Bước 3: Khởi Động Development Server

**Trong Git Bash hoặc VSCode Terminal:**
```bash
npm run dev
```

**Kết quả mong đợi:**
```
🔄 Testing database connection...
✅ Database connected successfully
   📅 Server time: 2024-01-15 10:30:45
   🐘 PostgreSQL version: PostgreSQL 18.0

🔄 Testing Redis connection...
✅ Redis connection test successful
   ✓ Redis read/write operations working
   🔴 Redis version: 7.2.3

🚀 ===================================
🚀 NutriCoach API Server is running!
🚀 Environment: development
🚀 URL: http://localhost:3000
🚀 Health: http://localhost:3000/health
🚀 ===================================
```

### ✅ Bước 4: Test API

**Option 1: Dùng Browser**
- Mở: http://localhost:3000
- Mở: http://localhost:3000/health

**Option 2: Dùng Thunder Client trong VSCode**
- Install extension "Thunder Client"
- New Request → GET → http://localhost:3000/health

**Option 3: Dùng curl trong Git Bash**
```bash
curl http://localhost:3000/health
```

---

## 7. Testing & Debugging

### 🔍 Kiểm Tra Logs

**Trong terminal đang chạy server, bạn sẽ thấy:**
```
[nodemon] restarting due to changes...
[nodemon] starting `tsx src/server.ts`
GET /health 200 5.234 ms - 98
```

### 🐛 Debug trong VSCode

**Tạo file `.vscode/launch.json`:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

**Để debug:**
1. Đặt breakpoint bằng cách click vào số dòng
2. Nhấn F5 hoặc Run → Start Debugging
3. Server sẽ dừng tại breakpoint

### 📊 Drizzle Studio (Database GUI)

```bash
# Mở Drizzle Studio
npm run db:studio
```

Browser sẽ tự động mở: http://localhost:4983

### 🔴 Redis Commander (Redis GUI)

**Cài đặt globally:**
```bash
npm install -g redis-commander

# Chạy
redis-commander

# Mở browser: http://localhost:8081
```

---

## 8. Deploy Production

### 🌐 Option 1: Deploy Lên Ubuntu VM (Full Stack)

**Bước 1: Cài Node.js trên Ubuntu VM**
```bash
# SSH vào Ubuntu VM
ssh username@YOUR_VM_IP

# Cài Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v
npm -v
```

**Bước 2: Clone Project Lên VM**
```bash
# Tạo folder
mkdir -p ~/projects
cd ~/projects

# Clone từ Git (nếu đã push lên GitHub)
git clone https://github.com/your-username/nutricoach-backend.git
cd nutricoach-backend

# Hoặc copy từ Windows lên VM
# Từ Windows Git Bash:
scp -r /d/Projects/nutricoach-backend username@YOUR_VM_IP:~/projects/
```

**Bước 3: Setup trên VM**
```bash
# Install dependencies
npm install

# Tạo .env file
nano .env
# Copy nội dung từ Windows và paste (Ctrl+Shift+V)
# Sửa DB_HOST thành localhost vì PostgreSQL cùng máy

# Build production
npm run build

# Test
npm start
```

**Bước 4: Dùng PM2 để chạy background**
```bash
# Cài PM2
sudo npm install -g pm2

# Chạy app với PM2
pm2 start dist/server.js --name nutricoach-api

# Auto start khi reboot
pm2 startup
pm2 save

# Xem logs
pm2 logs nutricoach-api

# Các lệnh PM2 hữu ích
pm2 list          # Danh sách apps
pm2 restart all   # Restart
pm2 stop all      # Stop
pm2 delete all    # Xóa
```

**Bước 5: Setup Nginx Reverse Proxy**
```bash
# Cài Nginx
sudo apt install nginx -y

# Tạo config
sudo nano /etc/nginx/sites-available/nutricoach
```

**Nội dung file config:**
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/nutricoach /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 🐳 Option 2: Deploy Với Docker

**Tạo file `Dockerfile`:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**Build và chạy:**
```bash
# Build image
docker build -t nutricoach-api .

# Chạy container
docker run -d \
  --name nutricoach-api \
  -p 3000:3000 \
  --env-file .env \
  nutricoach-api
```

---

## 🎯 Checklist Hoàn Thành

- [ ] ✅ PostgreSQL trên Ubuntu VM đã cấu hình
- [ ] ✅ Project đã clone/tạo trên Windows
- [ ] ✅ Dependencies đã cài đặt
- [ ] ✅ File .env đã cấu hình đúng
- [ ] ✅ Database migrations đã chạy thành công
- [ ] ✅ Redis đang chạy
- [ ] ✅ Server development đã khởi động
- [ ] ✅ Health check endpoint working
- [ ] ✅ Có thể debug trong VSCode

---

## 🆘 Troubleshooting

### ❌ "Cannot connect to database"

**Kiểm tra:**
```bash
# Test kết nối từ Windows
telnet YOUR_VM_IP 5432

# Nếu không kết nối được:
# - Kiểm tra firewall trên VM
# - Kiểm tra pg_hba.conf
# - Kiểm tra postgresql.conf
```

### ❌ "ECONNREFUSED Redis"

**Giải pháp:**
```bash
# Option 1: Start Redis trên Windows
docker start nutricoach-redis

# Option 2: Dùng Redis trên VM
# Update .env: REDIS_URL=redis://YOUR_VM_IP:6379
```

### ❌ "Port 3000 is already in use"

**Giải pháp:**
```bash
# Tìm process đang dùng port
netstat -ano | findstr :3000

# Kill process (thay PID)
taskkill /PID 1234 /F

# Hoặc đổi port trong .env
PORT=3001
```

### ❌ Migration errors

**Giải pháp:**
```bash
# Reset database (⚠️ mất dữ liệu)
# Trong PostgreSQL:
DROP DATABASE nutricoach_db;
CREATE DATABASE nutricoach_db;
GRANT ALL PRIVILEGES ON DATABASE nutricoach_db TO nutricoach;

# Chạy lại migration
npm run db:migrate
```

---

## 📚 Resources

- **PostgreSQL Docs**: https://www.postgresql.org/docs/18/
- **Drizzle ORM**: https://orm.drizzle.team
- **Express.js**: https://expressjs.com
- **TypeScript**: https://www.typescriptlang.org

---

## 🎉 Chúc Mừng!

Bạn đã setup thành công NutriCoach Backend! 🚀

**Next Steps:**
1. Tạo các API endpoints cho auth, users, nutrition...
2. Implement AI features với OpenAI
3. Setup file upload với Multer
4. Tích hợp PayOS payment
5. Deploy production lên cloud (VPS, AWS, etc.)

Happy Coding! 💻✨
