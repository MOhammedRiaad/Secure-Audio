const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');

const prisma = new PrismaClient();

// @desc    Get chapters for an audio file
// @route   GET /api/v1/files/:fileId/chapters
// @access  Private
exports.getAudioChapters = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  
  // Check if file exists and user has access
  const file = await prisma.audioFile.findUnique({
    where: { id: fileId },
    include: {
      fileAccesses: {
        where: {
          userId: req.user.id,
          canView: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }
    }
  });

  if (!file) {
    return next(new ErrorResponse('Audio file not found', 404));
  }

  // Check access (admins have access to all files)
  if (req.user.role !== 'admin' && !file.isPublic && file.fileAccesses.length === 0) {
    return next(new ErrorResponse('Not authorized to access this file', 403));
  }

  // Get chapters for the file
  const chapters = await prisma.audioChapter.findMany({
    where: { fileId },
    orderBy: { order: 'asc' }
  });

  res.status(200).json({
    success: true,
    count: chapters.length,
    data: chapters
  });
});

// @desc    Create chapters for an audio file
// @route   POST /api/v1/files/:fileId/chapters
// @access  Private/Admin
exports.createAudioChapters = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  const { chapters } = req.body;

  if (!chapters || !Array.isArray(chapters)) {
    return next(new ErrorResponse('Please provide chapters array', 400));
  }

  // Check if file exists
  const file = await prisma.audioFile.findUnique({
    where: { id: fileId }
  });

  if (!file) {
    return next(new ErrorResponse('Audio file not found', 404));
  }

  // Delete existing chapters for this file
  await prisma.audioChapter.deleteMany({
    where: { fileId }
  });

  // Create new chapters
  const createdChapters = [];
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const createdChapter = await prisma.audioChapter.create({
      data: {
        fileId,
        label: chapter.label,
        startTime: chapter.startTime,
        endTime: chapter.endTime || null,
        order: i + 1
      }
    });
    createdChapters.push(createdChapter);
  }

  res.status(201).json({
    success: true,
    count: createdChapters.length,
    data: createdChapters
  });
});

// @desc    Update a specific chapter
// @route   PUT /api/v1/files/:fileId/chapters/:chapterId
// @access  Private/Admin
exports.updateAudioChapter = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  const chapterId = parseInt(req.params.chapterId);
  const { label, startTime, endTime, order } = req.body;

  // Check if chapter exists and belongs to the file
  const chapter = await prisma.audioChapter.findFirst({
    where: {
      id: chapterId,
      fileId
    }
  });

  if (!chapter) {
    return next(new ErrorResponse('Chapter not found', 404));
  }

  // Update chapter
  const updatedChapter = await prisma.audioChapter.update({
    where: { id: chapterId },
    data: {
      ...(label && { label }),
      ...(startTime !== undefined && { startTime }),
      ...(endTime !== undefined && { endTime }),
      ...(order !== undefined && { order })
    }
  });

  res.status(200).json({
    success: true,
    data: updatedChapter
  });
});

// @desc    Delete a specific chapter
// @route   DELETE /api/v1/files/:fileId/chapters/:chapterId
// @access  Private/Admin
exports.deleteAudioChapter = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  const chapterId = parseInt(req.params.chapterId);

  // Check if chapter exists and belongs to the file
  const chapter = await prisma.audioChapter.findFirst({
    where: {
      id: chapterId,
      fileId
    }
  });

  if (!chapter) {
    return next(new ErrorResponse('Chapter not found', 404));
  }

  // Delete chapter
  await prisma.audioChapter.delete({
    where: { id: chapterId }
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Add sample chapters for testing
// @route   POST /api/v1/files/:fileId/chapters/sample
// @access  Private/Admin
exports.addSampleChapters = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);

  // Check if file exists
  const file = await prisma.audioFile.findUnique({
    where: { id: fileId }
  });

  if (!file) {
    return next(new ErrorResponse('Audio file not found', 404));
  }

  // Sample chapters data
  const sampleChapters = [
    { label: "Opening Credits", startTime: 0 },
    { label: "Acknowledgements", startTime: 14 },
    { label: "Foreword", startTime: 222 },
    { label: "Introduction", startTime: 2726 },
    { label: "Notes", startTime: 3554 },
    { label: "Chapter 1", startTime: 3663 },
    { label: "Chapter 2", startTime: 6148 },
    { label: "Chapter 3", startTime: 9026 },
    { label: "Chapter 4", startTime: 10987 },
    { label: "Chapter 5", startTime: 13626 },
    { label: "Chapter 6", startTime: 15516 },
    { label: "Chapter 7", startTime: 18234 },
    { label: "Chapter 8", startTime: 20920 },
    { label: "Chapter 9", startTime: 24280 },
    { label: "Chapter 10", startTime: 26298 },
    { label: "Chapter 11", startTime: 28293 },
    { label: "Chapter 12", startTime: 31875 },
    { label: "Chapter 13", startTime: 34156 },
    { label: "Chapter 14", startTime: 36520 },
    { label: "Chapter 15", startTime: 38745 },
    { label: "Chapter 16", startTime: 40818 },
    { label: "Chapter 17", startTime: 43279 },
    { label: "Chapter 18", startTime: 45397 },
    { label: "Chapter 19", startTime: 47568 },
    { label: "Chapter 20", startTime: 49737 },
    { label: "Epilogue", startTime: 51820 },
    { label: "Closing Credits", startTime: 52550 },
    { label: "The End", startTime: 52567 }
  ];

  // Delete existing chapters for this file
  await prisma.audioChapter.deleteMany({
    where: { fileId }
  });

  // Create new chapters
  const createdChapters = [];
  for (let i = 0; i < sampleChapters.length; i++) {
    const chapter = sampleChapters[i];
    const createdChapter = await prisma.audioChapter.create({
      data: {
        fileId,
        label: chapter.label,
        startTime: chapter.startTime,
        endTime: i < sampleChapters.length - 1 ? sampleChapters[i + 1].startTime : null,
        order: i + 1
      }
    });
    createdChapters.push(createdChapter);
  }

  res.status(201).json({
    success: true,
    message: 'Sample chapters added successfully',
    count: createdChapters.length,
    data: createdChapters
  });
});