# 🥗 NutriCoach Backend API

> Nền tảng AI-powered nutrition và fitness coaching - Backend API

## 📖 Giới Thiệu

NutriCoach là một ứng dụng dinh dưỡng và tập luyện thông minh, giúp người dùng:
- 📊 Theo dõi chỉ số cơ thể và dinh dưỡng
- 🍽️ Nhận thực đơn cá nhân hóa từ AI
- 📸 Scan món ăn để tính toán calories
- 💪 Kho bài tập phong phú với video hướng dẫn
- 👨‍🏫 Kết nối với Personal Trainer (PT)
- 💰 Nền tảng cho PT kiếm thêm thu nhập

## 🚀 Tech Stack

### Core
- **Runtime**: Node.js v18/v20
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 18
- **ORM**: Drizzle ORM
- **Cache**: Redis 7

### AI & External Services
- **AI**: OpenAI API
- **Payment**: PayOS
- **Storage**: Local / AWS S3 / Cloudflare R2

### Security & Middleware
- **Authentication**: JWT + bcrypt
- **Validation**: Zod
- **Rate Limiting**: express-rate-limit
- **Security**: Helmet, CORS

## 📁 Project Structure

```
nutricoach-backend/
├── src/
│   ├── config/          # Cấu hình (database, redis, env)
│   ├── db/              # Database schemas & migrations
│   │   ├── schema/      # Drizzle schemas
│   │   └── migrations/  # SQL migrations
│   ├── modules/         # Business logic modules
│   │   ├── auth/        # Authentication
│   │   ├── users/       # User management
│   │   ├── nutrition/   # AI nutrition planning
│   │   ├── scan/        # AI food scanning
│   │   ├── workout/     # Workout library
│   │   ├── pt/          # PT platform
│   │   ├── payment/     # Payment processing
│   │   ├── content/     # Articles & content
│   │   └── dashboard/   # User dashboard
│   ├── middlewares/     # Express middlewares
│   ├── lib/             # Shared utilities
│   ├── types/           # TypeScript types
│   └── utils/           # Helper functions
├── uploads/             # File uploads
├── logs/                # Application logs
├── .env                 # Environment variables
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
└── drizzle.config.ts    # Drizzle ORM config
```

## 🎯 Features

### ✅ Core Features
- [x] User authentication (JWT)
- [x] Database setup with Drizzle ORM
- [x] Redis caching
- [ ] AI meal planning
- [ ] Food scanning with OpenAI Vision
- [ ] Workout library management
- [ ] PT platform & marketplace
- [ ] Payment integration (PayOS)
- [ ] Content management

### 🔒 Security
- Environment variable validation with Zod
- Password hashing with bcrypt
- JWT token authentication
- Rate limiting
- Helmet security headers
- CORS protection

### 🚀 Performance
- PostgreSQL connection pooling
- Redis caching layer
- Auto-pipelining for Redis
- Optimized database queries

## 📦 Installation

### Prerequisites
- Node.js v18 or v20
- PostgreSQL 18
- Redis 7
- Git

### Quick Start

**Option 1: Automated Setup (Windows)**
```bash
# Run setup script
setup.bat

# Edit .env file with your configuration
notepad .env

# Generate and run migrations
npm run db:generate
npm run db:migrate

# Start development server
npm run dev
```

**Option 2: Manual Setup**
```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your configuration
# DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, etc.

# 4. Generate JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 5. Run migrations
npm run db:generate
npm run db:migrate

# 6. Start server
npm run dev
```

## 🔧 Configuration

### Environment Variables

Tạo file `.env` từ `.env.example` và cấu hình:

```env
# Application
NODE_ENV=development
PORT=3000

# Database (PostgreSQL)
DB_HOST=your-vm-ip
DB_PORT=5432
DB_USER=nutricoach
DB_PASSWORD=your-password
DB_NAME=nutricoach_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-min-32-chars
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-proj-your-key

# PayOS
PAYOS_CLIENT_ID=your-client-id
PAYOS_API_KEY=your-api-key
```

### Database Setup

**PostgreSQL trên Ubuntu VM:**

```sql
-- Tạo database và user
CREATE USER nutricoach WITH PASSWORD 'your_password';
CREATE DATABASE nutricoach_db;
GRANT ALL PRIVILEGES ON DATABASE nutricoach_db TO nutricoach;
```

**Cho phép kết nối từ xa:**
```bash
# Sửa postgresql.conf
listen_addresses = '*'

# Sửa pg_hba.conf
host all all 0.0.0.0/0 md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

## 🏃 Running the Project

### Development Mode
```bash
npm run dev
```
Server sẽ chạy tại: http://localhost:3000

### Production Mode
```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Database Commands
```bash
# Generate migrations from schema
npm run db:generate

# Run migrations
npm run db:migrate

# Open Drizzle Studio (Database GUI)
npm run db:studio

# Push schema changes (dev only)
npm run db:push
```

## 🧪 Testing

### Health Check
```bash
# Browser
http://localhost:3000/health

# cURL
curl http://localhost:3000/health

# Response
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.000Z",
  "environment": "development"
}
```

### Database Connection Test
```bash
# Test from Windows to Ubuntu VM
psql -h YOUR_VM_IP -U nutricoach -d nutricoach_db
```

### Redis Connection Test
```bash
# Connect to Redis
redis-cli ping
# Should return: PONG
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Endpoints (Planned)

#### Authentication
- `POST /auth/register` - Đăng ký tài khoản
- `POST /auth/login` - Đăng nhập
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Đăng xuất

#### Users
- `GET /users/me` - Thông tin user hiện tại
- `PUT /users/me` - Cập nhật thông tin
- `GET /users/stats` - Thống kê cơ thể

#### Nutrition
- `POST /nutrition/plan` - Tạo thực đơn AI
- `GET /nutrition/meals` - Danh sách bữa ăn
- `POST /nutrition/log` - Ghi nhận bữa ăn

#### Scan
- `POST /scan/food` - Scan món ăn
- `GET /scan/history` - Lịch sử scan

#### Workout
- `GET /workouts` - Danh sách bài tập
- `GET /workouts/:id` - Chi tiết bài tập
- `POST /workouts/log` - Ghi nhận tập luyện

#### PT Platform
- `GET /pt/courses` - Danh sách khóa học
- `POST /pt/courses` - Tạo khóa học (PT only)
- `GET /pt/students` - Học viên của PT

## 🐛 Troubleshooting

### Common Issues

**❌ Cannot connect to database**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check firewall
sudo ufw status
sudo ufw allow 5432/tcp

# Test connection
telnet YOUR_VM_IP 5432
```

**❌ ECONNREFUSED Redis**
```bash
# Start Redis
docker start nutricoach-redis
# Or
sudo systemctl start redis-server
```

**❌ Port already in use**
```bash
# Windows: Find and kill process
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or change PORT in .env
```

**❌ Migration failed**
```bash
# Check database connection
npm run db:studio

# Reset database (⚠️ loses data)
# In PostgreSQL:
DROP DATABASE nutricoach_db;
CREATE DATABASE nutricoach_db;

# Run migrations again
npm run db:migrate
```

## 📖 Documentation

- [📘 Hướng Dẫn Deploy Chi Tiết](HUONG_DAN_DEPLOY.md)
- [⚙️ Setup Guide](SETUP_GUIDE.md)
- [🏗️ Project Structure](structure.txt)

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 👥 Team

NutriCoach Development Team

## 🆘 Support

Nếu gặp vấn đề:
1. Xem [HUONG_DAN_DEPLOY.md](HUONG_DAN_DEPLOY.md)
2. Check [Troubleshooting](#troubleshooting)
3. Liên hệ team

---

Made with ❤️ by NutriCoach Team
