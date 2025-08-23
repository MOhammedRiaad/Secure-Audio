const { PrismaClient } = require('@prisma/client');

async function testConnection() {
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
  });

  try {
    console.log('Attempting to connect to the database...');
    await prisma.$connect();
    console.log('✅ Successfully connected to the database');
    
    // Test a simple query
    const users = await prisma.user.findMany({
      take: 5,
      select: { id: true, email: true, role: true }
    });
    console.log('Found users:', users);

  } catch (error) {
    console.error('❌ Failed to connect to the database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection().catch(console.error);
