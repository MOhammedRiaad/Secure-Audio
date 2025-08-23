const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkFiles() {
  try {
    const files = await prisma.audioFile.findMany({
      select: {
        id: true,
        filename: true,
        isPublic: true,
        fileAccesses: {
          select: {
            userId: true
          }
        }
      }
    });
    
    console.log('Available files:');
    console.log(JSON.stringify(files, null, 2));
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true
      }
    });
    
    console.log('\nAvailable users:');
    console.log(JSON.stringify(users, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFiles();