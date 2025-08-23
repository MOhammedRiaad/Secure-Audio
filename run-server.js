// Load environment variables first - this must be the very first thing we do
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file
const envPath = path.resolve(__dirname, '.env');
console.log('Loading environment variables from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

console.log('Starting server with detailed logging...');
console.log('Current directory:', process.cwd());
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  JWT_SECRET: process.env.JWT_SECRET ? '*** SET ***' : '*** NOT SET ***',
  DATABASE_URL: process.env.DATABASE_URL ? '*** SET ***' : '*** NOT SET ***',
  CORS_ORIGIN: process.env.CORS_ORIGIN
});

// Load the server
const server = require('./server');

// Start the server
(async () => {
  try {
    // If the server exports a startServer function, use it
    if (typeof server.startServer === 'function') {
      await server.startServer();
    } else if (server.listen) {
      // If it's an Express app, start it directly
      const PORT = process.env.PORT || 5000;
      server.listen(PORT, () => {
        console.log(`Server started on port ${PORT}`);
      });
    } else {
      console.log('Server module loaded but no valid server found to start');
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
