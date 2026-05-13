@echo off
REM ========================================
REM NutriCoach Backend - Quick Setup Script (Windows)
REM ========================================

echo.
echo ================================
echo 🚀 NutriCoach Backend Setup
echo ================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed!
    echo ℹ️  Please install Node.js v18 or v20 from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js %NODE_VERSION% detected

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ npm is not installed!
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm %NPM_VERSION% detected

echo.
echo 📦 Installing dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully

echo.
echo 📝 Setting up environment variables...

REM Check if .env already exists
if exist .env (
    echo ℹ️  .env file already exists. Skipping...
) else (
    if exist .env.example (
        copy .env.example .env >nul
        echo ✅ .env file created from template
        echo ⚠️  Please edit .env file with your configuration!
    ) else (
        echo ❌ .env.example not found
        pause
        exit /b 1
    )
)

echo.
echo 🏗️  Creating directory structure...

REM Create necessary directories
if not exist uploads mkdir uploads
if not exist logs mkdir logs
if not exist temp mkdir temp

echo ✅ Directory structure created

echo.
echo 🎉 Setup completed successfully!
echo.
echo ================================
echo 📋 Next Steps:
echo ================================
echo.
echo 1. Edit .env file with your configuration
echo    - Database credentials (PostgreSQL)
echo    - Redis URL
echo    - JWT secrets
echo    - OpenAI API key
echo    - PayOS credentials
echo.
echo 2. Make sure PostgreSQL and Redis are running
echo.
echo 3. Run database migrations:
echo    npm run db:generate
echo    npm run db:migrate
echo.
echo 4. Start development server:
echo    npm run dev
echo.
echo 5. Test the API:
echo    Open browser: http://localhost:3000/health
echo.
echo ================================
echo.
echo 📚 For detailed instructions, see HUONG_DAN_DEPLOY.md
echo.
pause
