# ⚡ HƯỚNG DẪN NHANH - NUTRICOACH BACKEND

## 🎯 TÓM TẮT

Bạn có:
- ✅ Windows với VSCode và Git Bash
- ✅ PostgreSQL 18 trên Ubuntu VM
- ✅ Claude Pro

Mục tiêu: Deploy NutriCoach backend để bắt đầu code!

---

## 🚀 5 BƯỚC ĐỂ BẮT ĐẦU

### Bước 1️⃣: Setup PostgreSQL trên Ubuntu VM (5 phút)

**SSH vào Ubuntu VM:**
```bash
ssh username@YOUR_VM_IP
```

**Tạo database:**
```bash
sudo -u postgres psql
```

**Trong PostgreSQL shell:**
```sql
CREATE USER nutricoach WITH PASSWORD 'nutricoach_secret_2024';
CREATE DATABASE nutricoach_db;
GRANT ALL PRIVILEGES ON DATABASE nutricoach_db TO nutricoach;
\c nutricoach_db
GRANT ALL ON SCHEMA public TO nutricoach;
\q
```

**Cho phép kết nối từ Windows:**
```bash
# Sửa postgresql.conf
sudo nano /etc/postgresql/18/main/postgresql.conf
# Đổi: listen_addresses = '*'

# Sửa pg_hba.conf
sudo nano /etc/postgresql/18/main/pg_hba.conf
# Thêm dòng: host all all 0.0.0.0/0 md5

# Restart
sudo systemctl restart postgresql

# Mở firewall
sudo ufw allow 5432/tcp
```

**Test từ Windows:**
```bash
# Trong Git Bash
psql -h YOUR_VM_IP -p 5432 -U nutricoach -d nutricoach_db
# Nhập password: nutricoach_secret_2024
```

---

### Bước 2️⃣: Setup Project trên Windows (3 phút)

**Tạo folder và khởi tạo project:**
```bash
# Mở Git Bash
cd /d/Projects
mkdir nutricoach-backend
cd nutricoach-backend

# Copy tất cả files từ folder đã tải về
# Hoặc khởi tạo mới:
npm init -y
```

**Chạy script setup tự động:**
```bash
# Windows
./setup.bat

# Hoặc Git Bash
bash setup.sh
```

**Script sẽ tự động:**
- ✅ Cài tất cả dependencies
- ✅ Tạo file .env từ template
- ✅ Tạo folders cần thiết

---

### Bước 3️⃣: Cấu Hình .env (2 phút)

**Mở file .env trong VSCode:**
```bash
code .env
```

**Điền thông tin:**
```env
# Application
NODE_ENV=development
PORT=3000

# Database - QUAN TRỌNG!
DB_HOST=YOUR_VM_IP          # ← Thay IP Ubuntu VM của bạn
DB_PORT=5432
DB_USER=nutricoach
DB_PASSWORD=nutricoach_secret_2024
DB_NAME=nutricoach_db

# Redis (nếu chưa có, skip)
REDIS_URL=redis://localhost:6379

# JWT Secret - Generate mới!
JWT_SECRET=your-secret-here  # ← Generate bên dưới
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_REFRESH_EXPIRES_IN=30d

# OpenAI (optional, có thể để sau)
OPENAI_API_KEY=sk-proj-your-key-here

# PayOS (optional, có thể để sau)
PAYOS_CLIENT_ID=your-client-id
PAYOS_API_KEY=your-api-key
```

**Generate JWT secrets:**
```bash
# Chạy 2 lần để có 2 secrets khác nhau
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy kết quả vào `JWT_SECRET` và `JWT_REFRESH_SECRET`

---

### Bước 4️⃣: Setup Redis (3 phút)

**Option 1: Dùng Docker (Recommended)**
```bash
# Cài Docker Desktop for Windows
# Download: https://www.docker.com/products/docker-desktop/

# Sau khi cài, chạy Redis:
docker run -d --name nutricoach-redis -p 6379:6379 redis:7-alpine

# Verify
docker ps
```

**Option 2: Redis trên Ubuntu VM**
```bash
# SSH vào Ubuntu
ssh username@YOUR_VM_IP

# Cài Redis
sudo apt update
sudo apt install redis-server -y
sudo systemctl start redis-server

# Test
redis-cli ping  # Phải trả về PONG
```

Nếu dùng Redis trên VM, update `.env`:
```env
REDIS_URL=redis://YOUR_VM_IP:6379
```

---

### Bước 5️⃣: Test & Khởi Động (2 phút)

**Test connections:**
```bash
npm run test:connection
```

**Nếu all tests PASS, tạo schema đầu tiên:**

Tạo file `src/db/schema/users.schema.ts`:
```typescript
import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

Tạo file `src/db/schema/index.ts`:
```typescript
export * from './users.schema';
```

**Generate và chạy migrations:**
```bash
npm run db:generate // npx drizzle-kit generate:pg
npm run db:migrate 
```

**Khởi động server:**
```bash
npm run dev
```

**Kết quả mong đợi:**
```
✅ Database connected successfully
✅ Redis connection test successful
🚀 ===================================
🚀 NutriCoach API Server is running!
🚀 URL: http://localhost:3000
🚀 ===================================
```

**Test API:**
```bash
# Mở browser
http://localhost:3000/health

# Hoặc dùng curl
curl http://localhost:3000/health
```

---

## ✅ CHECKLIST HOÀN THÀNH

- [ ] PostgreSQL trên Ubuntu VM đã setup
- [ ] Kết nối từ Windows đến PostgreSQL OK
- [ ] Project đã khởi tạo trên Windows
- [ ] File .env đã cấu hình
- [ ] Redis đang chạy
- [ ] Test connection script PASS
- [ ] Migrations đã chạy
- [ ] Server đã khởi động
- [ ] Health check endpoint trả về OK

---

## 🎯 NEXT STEPS

Bây giờ bạn có thể:

1. **Tạo API endpoints** trong `src/modules/`
2. **Tạo thêm schemas** trong `src/db/schema/`
3. **Implement authentication** trong `src/modules/auth/`
4. **Thêm AI features** với OpenAI API
5. **Tích hợp payment** với PayOS

---

## 📚 FILES QUAN TRỌNG

| File | Mục đích |
|------|----------|
| `HUONG_DAN_DEPLOY.md` | Hướng dẫn chi tiết từng bước |
| `README.md` | Tổng quan project |
| `SETUP_GUIDE.md` | Guide về cấu hình và troubleshooting |
| `setup.bat` | Script tự động setup (Windows) |
| `test-connection.ts` | Test database và Redis |
| `.env.example` | Template environment variables |
| `package.json` | Dependencies và scripts |

---

## 🆘 GẶP VẤN ĐỀ?

### ❌ "Cannot connect to database"
```bash
# Check PostgreSQL
ssh username@YOUR_VM_IP
sudo systemctl status postgresql

# Check firewall
sudo ufw status
telnet YOUR_VM_IP 5432
```

### ❌ "ECONNREFUSED Redis"
```bash
# Check Redis
docker ps
# Hoặc
sudo systemctl status redis-server
```

### ❌ "Test connection failed"
```bash
# Kiểm tra .env
cat .env | grep DB_HOST
cat .env | grep REDIS_URL

# Chạy lại test
npm run test:connection
```

---

## 💡 TIPS

1. **Dùng VSCode Extensions:**
   - Thunder Client (test API)
   - Remote - SSH (connect Ubuntu VM)
   - PostgreSQL (database explorer)

2. **Xem logs realtime:**
   ```bash
   npm run dev
   # Server tự reload khi bạn sửa code
   ```

3. **Database GUI:**
   ```bash
   npm run db:studio
   # Mở http://localhost:4983
   ```

4. **Git setup:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

---

## 🎉 CHÚC MỪNG!

Bạn đã setup xong NutriCoach Backend!

**Bắt đầu code ngay:**
```bash
code .
npm run dev
```

Happy Coding! 🚀💻
