const { PrismaClient } = require('@prisma/client');

async function testConnection() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://postgres:123@localhost:5432/secure_audio?schema=public'
      }
    },
    log: ['query', 'info', 'warn', 'error']
  });

  try {
    console.log('Testing database connection...');
    await prisma.$connect();
    console.log('✅ Successfully connected to the database');
    
    // Try to query the users table
    const users = await prisma.user.findMany({
      take: 1
    });
    
    console.log('✅ Successfully queried users table');
    console.log('First user:', users[0] || 'No users found');
    
    // Check the schema
    const tableInfo = await prisma.$queryRaw`
      SELECT table_name, column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position;
    `;
    
    console.log('\nDatabase schema:');
    console.table(tableInfo);
    
  } catch (error) {
    console.error('❌ Error connecting to the database:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
