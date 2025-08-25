const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const ErrorResponse = require('../../utils/errorResponse');
const asyncHandler = require('../../middleware/async');
const { bufferToBase64 } = require('../../middleware/imageUpload');

const prisma = new PrismaClient();

// @desc    Get all files with access info
// @route   GET /api/v1/admin/files
// @access  Private/Admin
exports.getFiles = asyncHandler(async (req, res, next) => {
  const files = await prisma.audioFile.findMany({
    include: {
      fileAccesses: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      checkpoints: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  res.status(200).json({
    success: true,
    count: files.length,
    data: files,
  });
});

// @desc    Get single file with access info
// @route   GET /api/v1/admin/files/:id
// @access  Private/Admin
exports.getFile = asyncHandler(async (req, res, next) => {
  const file = await prisma.audioFile.findUnique({
    where: {
      id: parseInt(req.params.id),
    },
    include: {
      fileAccesses: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      checkpoints: {
        orderBy: {
          timestamp: 'asc',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!file) {
    return next(
      new ErrorResponse(`File not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: file,
  });
});

// @desc    Update file metadata
// @route   PUT /api/v1/admin/files/:id
// @access  Private/Admin
exports.updateFile = asyncHandler(async (req, res, next) => {
  const { title, description, isPublic, coverStorageType } = req.body;
  const coverFile = req.files?.cover;
  
  const file = await prisma.audioFile.findUnique({
    where: {
      id: parseInt(req.params.id),
    },
  });

  if (!file) {
    return next(
      new ErrorResponse(`File not found with id of ${req.params.id}`, 404)
    );
  }

  // Handle cover image update
  let coverImagePath = file.coverImagePath;
  let coverImageBase64 = file.coverImageBase64;
  let coverImageMimeType = file.coverImageMimeType;

  if (coverFile) {
    coverImageMimeType = coverFile.mimetype;
    
    if (coverStorageType === 'base64') {
      // Store as base64 in database
      const imageBuffer = fs.readFileSync(coverFile.tempFilePath);
      coverImageBase64 = bufferToBase64(imageBuffer, coverFile.mimetype);
      coverImagePath = null; // Clear file path when using base64
    } else {
      // Store as file
      coverImagePath = path.basename(coverFile.path);
      coverImageBase64 = null; // Clear base64 when using file storage
    }
  }

  const updatedFile = await prisma.audioFile.update({
    where: {
      id: parseInt(req.params.id),
    },
    data: {
      ...(title && { title }),
      ...(description && { description }),
      ...(typeof isPublic === 'boolean' && { isPublic }),
      ...(coverFile && {
        coverImagePath,
        coverImageBase64,
        coverImageMimeType,
      }),
    },
    include: {
      fileAccesses: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      checkpoints: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    data: updatedFile,
  });
});

// @desc    Delete file
// @route   DELETE /api/v1/admin/files/:id
// @access  Private/Admin
exports.deleteFile = asyncHandler(async (req, res, next) => {
  const file = await prisma.audioFile.findUnique({
    where: {
      id: parseInt(req.params.id),
    },
  });

  if (!file) {
    return next(
      new ErrorResponse(`File not found with id of ${req.params.id}`, 404)
    );
  }

  // Delete the actual file from the filesystem
  const filePath = path.join(process.env.FILE_UPLOAD_PATH, file.filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete related records first (FileAccess, Checkpoints)
  await prisma.$transaction([
    prisma.fileAccess.deleteMany({
      where: { fileId: parseInt(req.params.id) },
    }),
    prisma.checkpoint.deleteMany({
      where: { fileId: parseInt(req.params.id) },
    }),
    prisma.audioFile.delete({
      where: { id: parseInt(req.params.id) },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get file statistics
// @route   GET /api/v1/admin/files/stats
// @access  Private/Admin
exports.getFileStats = asyncHandler(async (req, res, next) => {
  const [
    totalFiles,
    totalSize,
    totalDuration,
    publicFiles,
    privateFiles,
    filesByType,
    recentUploads,
  ] = await Promise.all([
    // Total number of files
    prisma.audioFile.count(),
    
    // Total storage used
    prisma.audioFile.aggregate({
      _sum: {
        size: true,
      },
    }),
    
    // Total duration
    prisma.audioFile.aggregate({
      _sum: {
        duration: true,
      },
    }),
    
    // Public files count
    prisma.audioFile.count({
      where: { isPublic: true },
    }),
    
    // Private files count
    prisma.audioFile.count({
      where: { isPublic: false },
    }),
    
    // Files by type
    prisma.audioFile.groupBy({
      by: ['mimeType'],
      _count: {
        _all: true,
      },
    }),
    
    // Recent uploads (last 7 days)
    prisma.audioFile.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
      select: {
        id: true,
        title: true,
        filename: true,
        mimeType: true,
        size: true,
        duration: true,
        createdAt: true,
      },
    }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      fileCount: totalFiles,
      totalFiles,
      totalSize: totalSize._sum.size || 0,
      totalDuration: totalDuration._sum.duration || 0,
      publicFiles,
      privateFiles,
      filesByType,
      recentUploads,
    },
  });
});
