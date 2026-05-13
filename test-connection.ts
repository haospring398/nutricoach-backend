/**
 * Test Database and Redis Connections
 * Run this script to verify your setup is working correctly
 * 
 * Usage: npm run test:connection
 * Or: tsx test-connection.ts
 */

import { config } from 'dotenv';

// Load environment variables
config();

async function testConnections() {
  console.log('');
  console.log('🔍 ========================================');
  console.log('🔍 NutriCoach Connection Test');
  console.log('🔍 ========================================');
  console.log('');

  let allTestsPassed = true;

  // Test 1: Environment Variables
  console.log('📋 Test 1: Checking Environment Variables...');
  console.log('─────────────────────────────────────────');
  
  const requiredEnvVars = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'REDIS_URL',
    'JWT_SECRET',
    'PORT'
  ];

  const missingVars: string[] = [];
  
  for (const varName of requiredEnvVars) {
    const value = process.env[varName];
    if (!value) {
      console.log(`   ❌ ${varName}: Missing`);
      missingVars.push(varName);
      allTestsPassed = false;
    } else {
      // Mask sensitive values
      const maskedValue = ['PASSWORD', 'SECRET', 'KEY'].some(word => varName.includes(word))
        ? '********'
        : value;
      console.log(`   ✅ ${varName}: ${maskedValue}`);
    }
  }

  console.log('');

  if (missingVars.length > 0) {
    console.log('❌ Environment test FAILED');
    console.log(`   Missing variables: ${missingVars.join(', ')}`);
    console.log('   Please check your .env file');
    console.log('');
    return false;
  } else {
    console.log('✅ Environment test PASSED');
    console.log('');
  }

  // Test 2: PostgreSQL Connection
  console.log('🐘 Test 2: Testing PostgreSQL Connection...');
  console.log('─────────────────────────────────────────');

  try {
    const { Pool } = await import('pg');
    
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionTimeoutMillis: 5000,
    });

    const client = await pool.connect();
    
    // Test query
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    
    console.log(`   ✅ Connection successful`);
    console.log(`   📅 Server time: ${result.rows[0].current_time}`);
    console.log(`   🐘 PostgreSQL: ${result.rows[0].pg_version.split(',')[0]}`);
    
    client.release();
    await pool.end();
    
    console.log('');
    console.log('✅ PostgreSQL test PASSED');
    console.log('');
    
  } catch (error: any) {
    console.log('   ❌ Connection failed');
    console.log(`   Error: ${error.message}`);
    console.log('');
    console.log('❌ PostgreSQL test FAILED');
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('   1. Check if PostgreSQL is running');
    console.log('   2. Verify DB_HOST, DB_PORT, DB_USER, DB_PASSWORD in .env');
    console.log('   3. Check firewall allows connection to port 5432');
    console.log('   4. Verify pg_hba.conf allows connection from your IP');
    console.log('');
    allTestsPassed = false;
  }

  // Test 3: Redis Connection
  console.log('🔴 Test 3: Testing Redis Connection...');
  console.log('─────────────────────────────────────────');

  try {
    const Redis = (await import('ioredis')).default;
    
    const redis = new Redis(process.env.REDIS_URL as string, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    await redis.connect();
    
    // Test PING
    const pong = await redis.ping();
    
    if (pong === 'PONG') {
      console.log('   ✅ Connection successful');
      console.log('   🏓 PING test: PONG received');
      
      // Test SET/GET
      await redis.set('test:connection', 'ok', 'EX', 10);
      const value = await redis.get('test:connection');
      
      if (value === 'ok') {
        console.log('   ✅ Read/Write test: OK');
      }
      
      // Get Redis info
      const info = await redis.info('server');
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      
      if (versionMatch) {
        console.log(`   🔴 Redis version: ${versionMatch[1]}`);
      }
    }
    
    redis.disconnect();
    
    console.log('');
    console.log('✅ Redis test PASSED');
    console.log('');
    
  } catch (error: any) {
    console.log('   ❌ Connection failed');
    console.log(`   Error: ${error.message}`);
    console.log('');
    console.log('❌ Redis test FAILED');
    console.log('');
    console.log('💡 Troubleshooting:');
    console.log('   1. Check if Redis is running');
    console.log('   2. Verify REDIS_URL in .env (format: redis://host:port)');
    console.log('   3. If using password: redis://:password@host:port');
    console.log('   4. Check firewall allows connection to port 6379');
    console.log('');
    allTestsPassed = false;
  }

  // Final Summary
  console.log('📊 ========================================');
  console.log('📊 Test Summary');
  console.log('📊 ========================================');
  console.log('');

  if (allTestsPassed) {
    console.log('🎉 All tests PASSED! ✅');
    console.log('');
    console.log('Your setup is ready! You can now:');
    console.log('   1. Run database migrations: npm run db:migrate');
    console.log('   2. Start the server: npm run dev');
    console.log('   3. Test the API: http://localhost:' + process.env.PORT + '/health');
    console.log('');
  } else {
    console.log('❌ Some tests FAILED');
    console.log('');
    console.log('Please fix the issues above and run this test again.');
    console.log('');
    process.exit(1);
  }
}

// Run tests
testConnections().catch((error) => {
  console.error('');
  console.error('❌ Unexpected error during testing:');
  console.error(error);
  console.error('');
  process.exit(1);
});
