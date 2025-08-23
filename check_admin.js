const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAdminUser() {
  try {
    console.log('Checking admin user...');
    
    // Find the admin user
    const adminUser = await prisma.user.findFirst({
      where: {
        email: 'admin@example.com'
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isAdmin: true,
        loginAttempts: true,
        lockUntil: true
      }
    });

    if (!adminUser) {
      console.log('❌ Admin user not found');
      return;
    }

    console.log('\nAdmin user details:');
    console.log('------------------');
    console.log(`ID: ${adminUser.id}`);
    console.log(`Name: ${adminUser.name}`);
    console.log(`Email: ${adminUser.email}`);
    console.log(`Role: ${adminUser.role}`);
    console.log(`isAdmin: ${adminUser.isAdmin}`);
    console.log(`Login Attempts: ${adminUser.loginAttempts}`);
    console.log(`Locked Until: ${adminUser.lockUntil || 'Not locked'}`);

    // Check JWT token generation
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: adminUser.id, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );
    
    console.log('\nGenerated JWT Token:');
    console.log('------------------');
    console.log(token);

    // Verify the token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('\nDecoded Token:');
      console.log('--------------');
      console.log(decoded);
    } catch (error) {
      console.error('\n❌ Error verifying token:', error.message);
    }

  } catch (error) {
    console.error('Error checking admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminUser();
