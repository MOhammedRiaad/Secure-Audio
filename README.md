# Secure Audio Streaming Application

A secure audio streaming application with DRM protection, user authentication, and checkpoint functionality.

## Features

- User authentication and authorization
- Secure file upload and storage
- DRM-protected audio streaming
- Checkpoint/timestamp system for audio files
- Role-based access control
- RESTful API

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- PostgreSQL
- FFmpeg (for audio processing)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd secure-audio
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Update the environment variables in `.env`

4. Set up the database:
   - Create a new PostgreSQL database
   - Update the `DATABASE_URL` in `.env`

5. Run database migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

## API Documentation

### Authentication

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login user
- `GET /api/v1/auth/me` - Get current user

### Audio Files

- `GET /api/v1/files` - Get all accessible audio files
- `GET /api/v1/files/:id` - Get audio file details
- `POST /api/v1/files` - Upload new audio file (admin only)
- `GET /api/v1/files/stream/:id` - Stream audio file
- `DELETE /api/v1/files/:id` - Delete audio file (admin only)

### Checkpoints

- `GET /api/v1/checkpoints/file/:fileId` - Get checkpoints for a file
- `POST /api/v1/checkpoints` - Create new checkpoint
- `GET /api/v1/checkpoints/:id` - Get checkpoint details
- `PUT /api/v1/checkpoints/:id` - Update checkpoint
- `DELETE /api/v1/checkpoints/:id` - Delete checkpoint

## Frontend

The frontend is a React application located in the `client` directory.

### Setup

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

## Security Considerations

- All audio files are stored with unique filenames
- Access to files is controlled by the application
- Authentication is required for protected routes
- File uploads are validated for type and size
- Sensitive routes are protected by role-based access control

## License

MIT
