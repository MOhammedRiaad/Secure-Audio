# Secure Audio API Documentation

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Tokens must be included in the `Authorization` header as `Bearer <token>` for protected routes.

### Register a New User

```http
POST /api/v1/auth/register
```

**Request Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "role": "user"
}
```

**Response**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "isAdmin": false
  }
}
```

### Login

```http
POST /api/v1/auth/login
```

**Request Body**
```json
{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "isAdmin": false
  }
}
```

### Get Current User

```http
GET /api/v1/auth/me
```

**Headers**
```
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "isAdmin": false,
    "createdAt": "2023-08-22T00:00:00.000Z"
  }
}
```

### Forgot Password

```http
POST /api/v1/auth/forgotpassword
```

**Request Body**
```json
{
  "email": "john@example.com"
}
```

**Response**
```json
{
  "success": true,
  "message": "If an account with that email exists, a reset link has been sent"
}
```

### Reset Password

```http
PUT /api/v1/auth/resetpassword/:resettoken
```

**Request Body**
```json
{
  "password": "NewSecurePassword123!"
}
```

**Response**
```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

### Update User Details

```http
PUT /api/v1/auth/updatedetails
```

**Headers**
```
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "name": "John Updated",
  "email": "john.updated@example.com"
}
```

**Response**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Updated",
    "email": "john.updated@example.com",
    "role": "user",
    "isAdmin": false
  }
}
```

### Update Password

```http
PUT /api/v1/auth/updatepassword
```

**Headers**
```
Authorization: Bearer <token>
```

**Request Body**
```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewSecurePassword123!"
}
```

**Response**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "id": 1,
    "name": "John Updated",
    "email": "john.updated@example.com",
    "role": "user",
    "isAdmin": false
  }
}
```

### Logout

```http
POST /api/v1/auth/logout
```

**Headers**
```
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {}
}
```

## Security Features

1. **Rate Limiting**:
   - Authentication endpoints: 10 requests per 15 minutes per IP
   - API endpoints: 100 requests per 15 minutes per IP
   - Sensitive operations: 5 requests per hour per IP

2. **Password Requirements**:
   - Minimum 8 characters
   - At least 1 uppercase letter
   - At least 1 lowercase letter
   - At least 1 number
   - At least 1 special character

3. **Account Lockout**:
   - Accounts are locked for 15 minutes after 5 failed login attempts

4. **Security Headers**:
   - Helmet.js for setting various HTTP headers
   - XSS protection
   - MIME type sniffing prevention
   - Clickjacking protection
   - CORS configuration

5. **Data Sanitization**:
   - NoSQL injection prevention
   - XSS protection
   - Parameter pollution prevention

## Error Handling

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "timestamp": "2023-08-22T00:00:00.000Z"
  }
}
```

Common error codes:
- `VALIDATION_ERROR`: Input validation failed
- `UNAUTHORIZED`: Authentication required or invalid credentials
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `TOO_MANY_REQUESTS`: Rate limit exceeded
- `INTERNAL_SERVER_ERROR`: Server error
