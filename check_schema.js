const { PrismaClient } = require('@prisma/client');

async function checkSchema() {
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
  });

  try {
    // Check if the users table exists and has the expected columns
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users';
    `;
    
    console.log('Users table schema:');
    console.table(result);
    
    // Check if the new security columns exist
    const securityColumns = [
      'login_attempts',
      'lock_until',
      'last_login',
      'reset_token',
      'reset_token_expire'
    ];
    
    const existingColumns = result.map(col => col.column_name);
    const missingColumns = securityColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.error('\nMissing security columns:', missingColumns);
      console.log('\nTry resetting the database and reapplying migrations:');
      console.log('1. npx prisma migrate reset --force');
      console.log('2. npx prisma migrate dev --name init');
    } else {
      console.log('\nAll security columns are present in the users table.');
    }
    
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
