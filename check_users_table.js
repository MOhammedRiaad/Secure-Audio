const { PrismaClient } = require('@prisma/client');

async function checkUsersTable() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres:123@localhost:5432/secure_audio?schema=public'
      }
    }
  });

  try {
    // Get table info using raw query
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users';
    `;
    
    console.log('Users table columns:');
    console.table(columns);
    
    // Check for specific security columns
    const requiredColumns = [
      'login_attempts',
      'lock_until',
      'last_login',
      'reset_token',
      'reset_token_expire'
    ];
    
    const existingColumns = columns.map(col => col.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('\nMissing columns:', missingColumns);
      console.log('\nTo fix this, run:');
      console.log('1. npx prisma migrate reset --force');
      console.log('2. npx prisma migrate dev --name init');
    } else {
      console.log('\nAll required columns are present in the users table.');
    }
    
  } catch (error) {
    console.error('Error checking users table:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsersTable();
