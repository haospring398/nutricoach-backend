#!/bin/bash

# ========================================
# NutriCoach Backend - Quick Setup Script
# ========================================
# This script automates the initial setup process

echo "🚀 NutriCoach Backend Setup"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed!"
    print_info "Please install Node.js v18 or v20 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
print_success "Node.js $NODE_VERSION detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed!"
    exit 1
fi

NPM_VERSION=$(npm -v)
print_success "npm $NPM_VERSION detected"

echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

echo ""
echo "📝 Setting up environment variables..."

# Check if .env already exists
if [ -f .env ]; then
    print_info ".env file already exists. Skipping..."
else
    if [ -f .env.example ]; then
        cp .env.example .env
        print_success ".env file created from template"
        print_info "⚠️  Please edit .env file with your configuration!"
    else
        print_error ".env.example not found"
        exit 1
    fi
fi

echo ""
echo "🏗️  Creating directory structure..."

# Create necessary directories
mkdir -p uploads
mkdir -p logs
mkdir -p temp

print_success "Directory structure created"

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "================================"
echo "📋 Next Steps:"
echo "================================"
echo ""
echo "1. Edit .env file with your configuration:"
echo "   - Database credentials (PostgreSQL)"
echo "   - Redis URL"
echo "   - JWT secrets (generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")"
echo "   - OpenAI API key"
echo "   - PayOS credentials"
echo ""
echo "2. Make sure PostgreSQL and Redis are running"
echo ""
echo "3. Run database migrations:"
echo "   npm run db:generate"
echo "   npm run db:migrate"
echo ""
echo "4. Start development server:"
echo "   npm run dev"
echo ""
echo "5. Test the API:"
echo "   curl http://localhost:3000/health"
echo ""
echo "================================"
echo ""
echo "📚 For detailed instructions, see HUONG_DAN_DEPLOY.md"
echo ""
