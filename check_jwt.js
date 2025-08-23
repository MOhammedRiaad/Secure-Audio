console.log('JWT Configuration Check');
console.log('======================');

// Check if JWT secret is set
const jwtSecret = process.env.JWT_SECRET;
const jwtExpire = process.env.JWT_EXPIRE || '30d';

console.log(`JWT_SECRET is ${jwtSecret ? 'set' : 'NOT SET'}`);
console.log(`JWT_EXPIRE: ${jwtExpire}`);

if (jwtSecret) {
  console.log('\nJWT_SECRET length:', jwtSecret.length);
  
  // Test JWT sign and verify
  const jwt = require('jsonwebtoken');
  const testPayload = { id: 'test', role: 'admin' };
  
  try {
    const token = jwt.sign(testPayload, jwtSecret, { expiresIn: jwtExpire });
    console.log('\nTest JWT Token:', token);
    
    const decoded = jwt.verify(token, jwtSecret);
    console.log('\nDecoded Test Token:', JSON.stringify(decoded, null, 2));
    
    console.log('\n✅ JWT sign and verify test passed');
  } catch (error) {
    console.error('\n❌ JWT Error:', error.message);
  }
} else {
  console.log('\n❌ JWT_SECRET is not set in environment variables');
  console.log('Please set JWT_SECRET in your .env file');
}
