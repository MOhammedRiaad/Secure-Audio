const express = require("express");
const cors = require("cors");
const path = require("path");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");
const { PrismaClient } = require("@prisma/client");
const errorHandler = require("./middleware/error");
const auth = require("./middleware/auth");
const {
  apiLimiter,
  sensitiveOperationLimiter,
} = require("./middleware/rateLimiter");

// Load environment variables
require("dotenv").config();

// Route files
const authRoutes = require("./routes/auth");
const audioFilesRoutes = require("./routes/audioFiles");
const checkpointsRoutes = require("./routes/checkpoints");
const drmStreamRoutes = require("./routes/drmStream");
const deviceManagementRoutes = require("./routes/deviceManagement");
const adminUsersRoutes = require("./routes/admin/users");
const adminFilesRoutes = require("./routes/admin/files");
const adminFileAccessRoutes = require("./routes/admin/fileAccess");
const adminCleanupRoutes = require("./routes/admin/cleanup");
const chunkedUploadRoutes = require("./routes/chunkedUpload");
const chunkCleanupService = require("./services/chunkCleanupService");

// Initialize Prisma Client
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

// Create Express app
const app = express();

// Behind Nginx/Proxy: trust a single proxy hop (safer than 'true')
app.set('trust proxy', 1);

// Set security HTTP headers
app.use(helmet());

// Enable CORS
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:5000"
)
  .split(",")
  .map((origin) => origin.trim());

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // In development, allow all localhost origins
    if (
      process.env.NODE_ENV === "development" &&
      origin &&
      origin.includes("localhost")
    ) {
      return callback(null, true);
    }

    // In development, also allow mobile development servers
    if (
      process.env.NODE_ENV === "development" &&
      origin &&
      (origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes("expo.dev") ||
        origin.includes("exp.host"))
    ) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg =
        "The CORS policy for this site does not allow access from the specified Origin.";
      console.error("CORS error:", msg, "Origin:", origin);
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Device-ID",
    "x-device-id",
    "X-Device-Fingerprint",
    "Range",
    "Accept",
    "Accept-Encoding",
    "Cache-Control",
    "Origin",
    "Referer",
    "User-Agent",
    "X-Upload-Id",
    "X-Chunk-Index",
    "X-Total-Chunks",
    "X-File-Name",
    "X-File-Size",
    "X-File-Hash",
  ],
  exposedHeaders: [
    "set-cookie",
    "Content-Range",
    "Accept-Ranges",
    "X-Chapter-Id",
    "X-Chapter-Label",
    "X-Secure-Stream",
    "X-Token-Validated",
    "X-Start-Time",
    "X-Seek-Applied",
  ],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

// Apply CORS with the specified options
app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

// Set security headers for all responses
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent opening page in iframe
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  next();
});


// Rate limiting for all API routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs (increased for device monitoring)
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for chunked upload endpoints
    return req.path.startsWith('/api/v1/audio/upload/');
  }
});

// Apply rate limiting to all API routes except chunked uploads
app.use("/api", limiter);

// Separate rate limiter for chunked uploads with higher limits
const chunkUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Allow up to 2000 chunk requests per 15 minutes
  message: "Too many upload requests from this IP, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply chunked upload rate limiter specifically to upload routes
app.use("/api/v1/audio/upload", chunkUploadLimiter);


// Body parser, reading data from body into req.body
app.use(express.json({ limit: "2gb" }));
app.use(express.urlencoded({ extended: true, limit: "2gb" }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(
  hpp({
    whitelist: [
      "duration",
      "ratingsQuantity",
      "ratingsAverage",
      "maxGroupSize",
      "difficulty",
      "price",
    ],
  })
);

// Dev logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Set static folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Mount routers
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/files", auth.protect, audioFilesRoutes);
app.use("/api/v1/audio/upload", chunkedUploadRoutes);
app.use("/api/v1/checkpoints", checkpointsRoutes);
app.use("/api/v1/drm", drmStreamRoutes);
app.use("/api/v1/devices", deviceManagementRoutes);

// Admin routes (protected and admin only)
app.use(
  "/api/v1/admin/users",
  [auth.protect, auth.authorize("admin")],
  adminUsersRoutes
);
app.use(
  "/api/v1/admin/files",
  [auth.protect, auth.authorize("admin")],
  adminFilesRoutes
);
app.use(
  "/api/v1/admin/file-access",
  [auth.protect, auth.authorize("admin")],
  adminFileAccessRoutes
);
app.use(
  "/api/v1/admin/cleanup",
  adminCleanupRoutes
);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log("Database connected successfully");
    
    // Start chunk cleanup service
    chunkCleanupService.start();
    console.log("Chunk cleanup service started");

    const server = app.listen(PORT, () => {
      console.log(
        `Server running in ${
          process.env.NODE_ENV || "development"
        } mode on port ${PORT}`
      );
    });

    // Configure server timeouts for large file uploads
    server.timeout = 10 * 60 * 1000; // 10 minutes
    server.keepAliveTimeout = 5 * 60 * 1000; // 5 minutes
    server.headersTimeout = 6 * 60 * 1000; // 6 minutes (must be greater than keepAliveTimeout)
    server.requestTimeout = 10 * 60 * 1000; // 10 minutes
    server.maxHeadersCount = 2000;
    server.maxRequestsPerSocket = 0; // No limit

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (err, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", err);
      // Close server & exit process
      server.close(() => process.exit(1));
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};
// For Vercel serverless deployment
module.exports = app;

// Export the Express app and startServer function for local development
module.exports.app = app;
module.exports.startServer = startServer;

// Only start the server if this file is run directly (not required)
if (require.main === module) {
  startServer();
}
