const { PrismaClient } = require('@prisma/client');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const AudioDRM = require('../utils/drm');
const { verifySignature } = require('../utils/signedUrl');
const { validateStreamToken } = require('../utils/streamToken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const performanceConfig = require('../config/performance');
const jwt = require('jsonwebtoken');
const MemoryMonitor = require('../utils/memoryMonitor');

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty'
});
const drm = new AudioDRM();
const memoryMonitor = new MemoryMonitor();

// @desc    Get chapters for an audio file
// @route   GET /api/v1/files/:fileId/chapters
// @access  Private
exports.getAudioChapters = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  
  // Validate fileId
  if (isNaN(fileId) || fileId <= 0) {
    return next(new ErrorResponse('Invalid file ID', 400));
  }
  
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
  try {
    // First, try a simple count to test the connection
    const chapterCount = await prisma.audioChapter.count({
      where: { fileId: fileId }
    });
    
    // If count works, try the full query
    const chapters = await prisma.audioChapter.findMany({
      where: { fileId: fileId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        label: true,
        startTime: true,
        endTime: true,
        order: true,
        status: true,
        encryptedPath: true,
        plainSize: true,
        encryptedSize: true,
        createdAt: true,
        finalizedAt: true
        // Exclude encryptedData to avoid binary data conversion issues
      }
    });

    res.status(200).json({
      success: true,
      count: chapters.length,
      data: chapters
    });
  } catch (error) {
    console.error('Error fetching chapters:', {
      message: error.message,
      code: error.code,
      name: error.name,
      fileId: fileId,
      fileIdType: typeof fileId
    });
    return next(new ErrorResponse(`Failed to fetch chapters: ${error.message}`, 500));
  }
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
    count: createdChapters.length,
    data: createdChapters
  });
})

// @desc    Finalize chapters by extracting and encrypting individual segments
// @route   POST /api/v1/files/:fileId/chapters/finalize
// @access  Private/Admin
exports.finalizeChapters = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  const { storageType } = req.body; // Optional override

  // Get file information with pending chapters
  const file = await prisma.audioFile.findUnique({
    where: { id: fileId },
    include: {
      chapters: {
        where: { status: 'pending' },
        orderBy: { order: 'asc' }
      }
    }
  });

  if (!file) {
    return next(new ErrorResponse('Audio file not found', 404));
  }

  if (!file.isEncrypted || !file.encryptionKey) {
    return next(new ErrorResponse('File must be encrypted to finalize chapters', 400));
  }

  if (file.chapters.length === 0) {
    return next(new ErrorResponse('No pending chapters found for this file', 400));
  }

  const masterFilePath = path.join(process.env.FILE_UPLOAD_PATH, file.path);
  
  if (!fs.existsSync(masterFilePath)) {
    return next(new ErrorResponse('Master file not found on disk', 404));
  }

  const finalizedChapters = [];
  const errors = [];
  let totalProcessed = 0;
  
  // Reduce concurrent processing for 2GB server
  const maxConcurrent = Math.min(performanceConfig.chapters.maxConcurrentChapters, 1); // Force single-threaded

  try {
    
    // Process chapters in batches for better memory management
    for (let i = 0; i < file.chapters.length; i += maxConcurrent) {
      const batch = file.chapters.slice(i, i + maxConcurrent);
      
      // Check memory before processing batch
      console.log(`📊 Memory check before processing batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(file.chapters.length / maxConcurrent)}`);
      memoryMonitor.logMemoryStatus(`Chapter Finalization - Batch ${Math.floor(i / maxConcurrent) + 1}`);
      
      const batchPromises = batch.map(async (chapter) => {
        try {
          console.log(`🔐 Processing chapter: ${chapter.label} (${chapter.startTime}s - ${chapter.endTime || 'end'}s)`);
          
          // Memory check before processing each chapter
          const memoryStatus = memoryMonitor.isMemorySafe();
          if (!memoryStatus.safe) {
            console.warn(`⚠️ Memory usage is ${memoryStatus.level} before processing chapter ${chapter.label}`);
            if (memoryStatus.level === 'critical') {
              console.log('🚨 Critical memory usage, forcing garbage collection...');
              memoryMonitor.forceGarbageCollection();
              
              // Wait for memory to become safe
              const safe = await memoryMonitor.waitForSafeMemory(10000);
              if (!safe) {
                throw new Error('Memory usage too high to safely process chapter');
              }
            }
          }
          
          // Create temporary file path for this chapter
          const tempChapterPath = path.join(
            process.env.FILE_UPLOAD_PATH, 
            performanceConfig.chapters.tempPath, 
            `temp_chapter_${fileId}_${chapter.id}_${Date.now()}.mp3`
          );
          
          // Ensure temp directory exists
          const tempDir = path.dirname(tempChapterPath);
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          // STEP 1: Extract audio segment to temporary file (streaming, no memory load)
          console.log(`📁 Extracting chapter to temp file: ${tempChapterPath}`);
          
          const extractionResult = await drm.processChapterStream(
            masterFilePath,
            chapter.startTime,
            chapter.endTime,
            file.encryptionKey,
            tempChapterPath
          );
          
          if (!extractionResult.success) {
            throw new Error('Failed to extract audio segment');
          }
          
          console.log(`✅ Chapter extracted: ${(extractionResult.size / 1024 / 1024).toFixed(2)}MB`);
          
          // Memory check after extraction
          memoryMonitor.logMemoryStatus(`After Chapter Extraction - ${chapter.label}`);
          
          // STEP 2: Encrypt the temporary file (streaming encryption)
          console.log(`🔐 Encrypting chapter segment...`);
          const encryptionResult = await drm.encryptChapterSegmentFromFile(tempChapterPath);
          
          console.log(`✅ Chapter encrypted: ${(encryptionResult.encryptedSize / 1024 / 1024).toFixed(2)}MB`);
          
          // Memory check after encryption
          memoryMonitor.logMemoryStatus(`After Chapter Encryption - ${chapter.label}`);
          
          // STEP 3: Move encrypted file to final location
          const finalChapterPath = path.join(
            process.env.FILE_UPLOAD_PATH, 
            performanceConfig.chapters.chapterStoragePath, 
            `chapter_${fileId}_${chapter.id}_${Date.now()}.enc`
          );
          
          // Ensure chapters directory exists
          const chaptersDir = path.dirname(finalChapterPath);
          if (!fs.existsSync(chaptersDir)) {
            fs.mkdirSync(chaptersDir, { recursive: true });
          }
          
          // Move encrypted file to final location
          fs.renameSync(encryptionResult.encryptedPath, finalChapterPath);
          
          // STEP 4: Update database with file-based storage
          const updateData = {
            status: 'ready',
            encryptionKey: encryptionResult.key,
            encryptionIV: encryptionResult.iv,
            encryptionTag: encryptionResult.authTag,
            encryptedPath: path.relative(process.env.FILE_UPLOAD_PATH, finalChapterPath),
            plainSize: encryptionResult.plainSize,
            encryptedSize: encryptionResult.encryptedSize,
            finalizedAt: new Date()
          };
          
          const updatedChapter = await prisma.audioChapter.update({
            where: { id: chapter.id },
            data: updateData
          });
          
          console.log(`💾 Chapter stored: ${updatedChapter.encryptedPath}`);
          
          // Force garbage collection after each chapter to free memory
          if (global.gc) {
            global.gc();
            console.log(`🗑️ Garbage collection triggered for chapter ${chapter.label}`);
          }
          
          // Final memory check for this chapter
          memoryMonitor.logMemoryStatus(`Chapter Complete - ${chapter.label}`);
          
          // IMMEDIATE CHAPTER CLEANUP
          try {
            // Clean up any temp files related to this specific chapter
            const tempDir = path.join(process.env.FILE_UPLOAD_PATH, performanceConfig.chapters.tempPath);
            if (fs.existsSync(tempDir)) {
              const tempFiles = fs.readdirSync(tempDir);
              let chapterCleaned = 0;
              let chapterSize = 0;
              
              for (const tempFile of tempFiles) {
                if (tempFile.includes(`temp_chapter_${fileId}_${chapter.id}_`)) {
                  const tempFilePath = path.join(tempDir, tempFile);
                  try {
                    const stats = fs.statSync(tempFilePath);
                    chapterSize += stats.size;
                    fs.unlinkSync(tempFilePath);
                    chapterCleaned++;
                  } catch (cleanupError) {
                    console.warn(`⚠️ Failed to clean chapter temp file ${tempFile}:`, cleanupError.message);
                  }
                }
              }
              
              if (chapterCleaned > 0) {
                console.log(`🧹 Chapter cleanup: ${chapterCleaned} temp files (${(chapterSize / 1024 / 1024).toFixed(2)}MB) freed for ${chapter.label}`);
              }
            }
          } catch (cleanupError) {
            console.warn(`⚠️ Chapter cleanup failed for ${chapter.label}:`, cleanupError.message);
          }
          
          return {
            success: true,
            chapter: {
              id: updatedChapter.id,
              label: updatedChapter.label,
              status: updatedChapter.status,
              plainSize: updatedChapter.plainSize,
              encryptedSize: updatedChapter.encryptedSize,
              storageType: 'filesystem',
              finalizedAt: updatedChapter.finalizedAt
            }
          };
          
        } catch (chapterError) {
          console.error(`❌ Error processing chapter ${chapter.label}:`, chapterError);
          
          // Mark chapter as failed
          await prisma.audioChapter.update({
            where: { id: chapter.id },
            data: { status: 'failed' }
          });
          
          return {
            success: false,
            error: {
              chapterId: chapter.id,
              label: chapter.label,
              error: chapterError.message
            }
          };
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process results
      batchResults.forEach(result => {
        if (result.success) {
          finalizedChapters.push(result.chapter);
        } else {
          errors.push(result.error);
        }
        totalProcessed++;
      });
      
      // Memory check after batch completion
      console.log(`📊 Memory check after completing batch ${Math.floor(i / maxConcurrent) + 1}`);
      memoryMonitor.logMemoryStatus(`Batch Complete - ${Math.floor(i / maxConcurrent) + 1}`);
      
      // BATCH CLEANUP
      try {
        const tempDir = path.join(process.env.FILE_UPLOAD_PATH, performanceConfig.chapters.tempPath);
        if (fs.existsSync(tempDir)) {
          const tempFiles = fs.readdirSync(tempDir);
          let batchCleaned = 0;
          let batchSize = 0;
          
          for (const tempFile of tempFiles) {
            if (tempFile.includes(`temp_chapter_${fileId}_`)) {
              const tempFilePath = path.join(tempDir, tempFile);
              try {
                const stats = fs.statSync(tempFilePath);
                batchSize += stats.size;
                fs.unlinkSync(tempFilePath);
                batchCleaned++;
              } catch (cleanupError) {
                console.warn(`⚠️ Failed to clean batch temp file ${tempFile}:`, cleanupError.message);
              }
            }
          }
          
          if (batchCleaned > 0) {
            console.log(`🧹 Batch cleanup: ${batchCleaned} temp files (${(batchSize / 1024 / 1024).toFixed(2)}MB) freed after batch ${Math.floor(i / maxConcurrent) + 1}`);
          }
        }
      } catch (cleanupError) {
        console.warn('⚠️ Batch cleanup failed:', cleanupError.message);
      }
      
      // Longer pause between batches for 2GB server
      if (i + maxConcurrent < file.chapters.length) {
        console.log(`⏸️ Pausing between batches to allow memory cleanup...`);
        
        // Force garbage collection between batches
        if (global.gc) {
          global.gc();
          console.log('🗑️ Batch cleanup: Garbage collection triggered');
        }
        
        // Wait for memory to stabilize
        await memoryMonitor.waitForSafeMemory(5000);
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second pause
      }
    }
    
    const successCount = finalizedChapters.length;
    const errorCount = errors.length;
    
    // Calculate storage distribution
    const storageStats = finalizedChapters.reduce((acc, chapter) => {
      acc[chapter.storageType] = (acc[chapter.storageType] || 0) + 1;
      return acc;
    }, {});
    
    // COMPREHENSIVE TEMP FOLDER CLEANUP
    console.log('🧹 Starting comprehensive temp folder cleanup...');
    try {
      const tempDir = path.join(process.env.FILE_UPLOAD_PATH, performanceConfig.chapters.tempPath);
      
      if (fs.existsSync(tempDir)) {
        // Clean up any remaining temp files from this processing session
        const tempFiles = fs.readdirSync(tempDir);
        let cleanedCount = 0;
        let cleanedSize = 0;
        
        for (const tempFile of tempFiles) {
          // Only clean temp files related to this file processing
          if (tempFile.includes(`temp_chapter_${fileId}_`)) {
            const tempFilePath = path.join(tempDir, tempFile);
            try {
              const stats = fs.statSync(tempFilePath);
              cleanedSize += stats.size;
              fs.unlinkSync(tempFilePath);
              cleanedCount++;
              console.log(`🧹 Cleaned temp file: ${tempFile} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            } catch (cleanupError) {
              console.warn(`⚠️ Failed to clean temp file ${tempFile}:`, cleanupError.message);
            }
          }
        }
        
        // Also clean up any orphaned temp files older than 1 hour
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        let orphanedCleaned = 0;
        let orphanedSize = 0;
        
        for (const tempFile of tempFiles) {
          if (tempFile.startsWith('temp_') && !tempFile.includes(`temp_chapter_${fileId}_`)) {
            const tempFilePath = path.join(tempDir, tempFile);
            try {
              const stats = fs.statSync(tempFilePath);
              if (stats.mtime.getTime() < oneHourAgo) {
                cleanedSize += stats.size;
                orphanedSize += stats.size;
                fs.unlinkSync(tempFilePath);
                orphanedCleaned++;
                console.log(`🧹 Cleaned orphaned temp file: ${tempFile} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
              }
            } catch (cleanupError) {
              console.warn(`⚠️ Failed to clean orphaned temp file ${tempFile}:`, cleanupError.message);
            }
          }
        }
        
        console.log(`🧹 Temp cleanup completed: ${cleanedCount} session files + ${orphanedCleaned} orphaned files = ${(cleanedSize / 1024 / 1024).toFixed(2)}MB freed`);
        
        // Try to remove empty temp directory if possible
        try {
          const remainingFiles = fs.readdirSync(tempDir);
          if (remainingFiles.length === 0) {
            fs.rmdirSync(tempDir);
            console.log('🧹 Removed empty temp directory');
          }
        } catch (rmdirError) {
          // Directory not empty or permission issue - that's fine
          console.log('🧹 Temp directory not empty, keeping for future use');
        }
      }
    } catch (cleanupError) {
      console.warn('⚠️ Temp folder cleanup failed:', cleanupError.message);
    }
    
    console.log(`🎉 Chapter finalization completed: ${successCount} success, ${errorCount} errors`);
    
    res.status(200).json({
      success: true,
      message: `Finalized ${successCount} chapters with ${errorCount} errors`,
      data: {
        finalizedChapters,
        errors,
        summary: {
          total: file.chapters.length,
          finalized: successCount,
          failed: errorCount,
          storageDistribution: storageStats,
          processingTime: Date.now() - Date.now(), // This would need proper timing
          maxConcurrentUsed: maxConcurrent,
          memoryOptimized: true
        }
      }
    });
    
  } catch (error) {
    console.error('Chapter finalization error:', error);
    return next(new ErrorResponse('Failed to finalize chapters', 500));
  }
});

// @desc    Get chapter finalization status
// @route   GET /api/v1/files/:fileId/chapters/status
// @access  Private/Admin
exports.getChapterStatus = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  
  const chapters = await prisma.audioChapter.findMany({
    where: { fileId },
    select: {
      id: true,
      label: true,
      startTime: true,
      endTime: true,
      order: true,
      status: true,
      plainSize: true,
      encryptedSize: true,
      encryptedPath: true,
      finalizedAt: true,
      createdAt: true
    },
    orderBy: { order: 'asc' }
  });
  
  const statusSummary = {
    total: chapters.length,
    pending: chapters.filter(c => c.status === 'pending').length,
    ready: chapters.filter(c => c.status === 'ready').length,
    failed: chapters.filter(c => c.status === 'failed').length
  };
  
  res.status(200).json({
    success: true,
    data: {
      chapters,
      summary: statusSummary
    }
  });
});

// @desc    Stream individual chapter with secure token validation
// @route   GET /api/v1/files/:fileId/chapters/:chapterId/stream
// @access  Private (with token and signature verification)
exports.streamChapter = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  const chapterId = parseInt(req.params.chapterId);
  const { expires, sig, token, start = "0", end = "-1" } = req.query;
  
  // **SECURITY VALIDATION**
  // 1. Validate required security parameters
  if (!expires || !sig || !token) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required security parameters (expires, sig, token)" 
    });
  }
  
  // 2. Verify JWT token for user authentication
  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id;
  } catch (jwtError) {
    console.error('Chapter streaming - Invalid JWT token:', jwtError.message);
    return res.status(401).json({ 
      success: false, 
      error: "Invalid or expired authentication token" 
    });
  }
  
  // 3. Verify expiry timestamp
  const now = Date.now();
  const exp = parseInt(expires, 10);
  if (!exp || now > exp) {
    console.error('Chapter streaming - Token expired:', { now, exp, expired: now > exp });
    return res.status(403).json({ 
      success: false, 
      error: "Token expired" 
    });
  }
  
  // 4. Verify signature for chapter streaming (IP bound)
  const chapterRef = `${fileId}:${chapterId}`;
  const signatureValid = verifySignature({
    fileRef: chapterRef,
    start,
    end,
    expires: exp,
    ip: req.ip,
    sig
  });
  
  if (!signatureValid) {
    console.error('Chapter streaming - Invalid signature:', {
      chapterRef,
      start,
      end,
      expires: exp,
      ip: req.ip,
      providedSig: sig
    });
    return res.status(403).json({ 
      success: false, 
      error: "Invalid signature" 
    });
  }
  
  
  // Get chapter information with file access check
  const chapter = await prisma.audioChapter.findFirst({
    where: {
      id: chapterId,
      fileId: fileId,
      status: 'ready' // Only stream finalized chapters
    },
    include: {
      audioFile: {
        include: {
          fileAccesses: {
            where: {
              userId: userId,
              canView: true,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
              ]
            }
          }
        }
      }
    }
  });
  
  if (!chapter) {
    return next(new ErrorResponse('Chapter not found or not ready for streaming', 404));
  }
  
  const file = chapter.audioFile;
  
  // Check access permissions (admin bypass)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isAdmin = user && user.role === 'admin';
  
  if (!isAdmin) {
    const hasAccess = file.fileAccesses.length > 0 || file.isPublic;
    if (!hasAccess) {
      return next(new ErrorResponse('Not authorized to access this file', 403));
    }
  }
  
  // Check if chapter has encryption data
  if (!chapter.encryptionKey || !chapter.encryptionIV || !chapter.encryptionTag) {
    return next(new ErrorResponse('Chapter encryption data not found', 500));
  }
  
  try {
    let encryptedData;
    
    // Get encrypted chapter data from database or filesystem
    if (chapter.encryptedData) {
      // Data stored in database (BYTEA)
      encryptedData = chapter.encryptedData;
    } else if (chapter.encryptedPath) {
      // Data stored in filesystem - use streaming for large files
      const chapterFilePath = path.join(process.env.FILE_UPLOAD_PATH, chapter.encryptedPath);
      
      if (!fs.existsSync(chapterFilePath)) {
        return next(new ErrorResponse('Chapter file not found on disk', 404));
      }
      
      // For large files, stream directly instead of loading into memory
      const stats = fs.statSync(chapterFilePath);
      if (stats.size > 50 * 1024 * 1024) { // 50MB threshold
        
        // Stream large encrypted file and decrypt on-the-fly with security headers
        const { Transform } = require('stream');
        const crypto = require('crypto');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', 
          Buffer.from(chapter.encryptionKey, 'hex'), 
          Buffer.from(chapter.encryptionIV, 'hex')
        );
        decipher.setAuthTag(Buffer.from(chapter.encryptionTag, 'hex'));
        
        // Set enhanced security headers
        res.setHeader('Content-Type', file.mimeType || 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Content-Security-Policy', "default-src 'none'");
        res.setHeader('X-Download-Options', 'noopen');
        res.setHeader('Content-Disposition', `inline; filename="${chapter.label}.mp3"`);
        res.setHeader('X-Chapter-Id', chapter.id.toString());
        res.setHeader('X-Chapter-Label', chapter.label);
        res.setHeader('X-Secure-Stream', 'true');
        res.setHeader('X-Token-Validated', 'true');
        res.setHeader('Accept-Ranges', 'none');
        
        res.status(200);
        
        // Set CORS headers for mobile client access (large file streaming)
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-Device-Fingerprint');
        res.setHeader('Access-Control-Expose-Headers', 'X-Chapter-Id, X-Chapter-Label, X-Secure-Stream, X-Token-Validated, Content-Range, Accept-Ranges');
        
        // Stream the file through the decipher
        const fileStream = fs.createReadStream(chapterFilePath);
        fileStream.pipe(decipher).pipe(res);
        
        fileStream.on('error', (error) => {
          console.error('Secure chapter stream file error:', error);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Stream error' });
          }
        });
        
        decipher.on('error', (error) => {
          console.error('Secure chapter stream decryption error:', error);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Decryption error' });
          }
        });
        
        return;
      }
      
      // For smaller files, load into memory (original approach)
      encryptedData = fs.readFileSync(chapterFilePath);
    } else {
      return next(new ErrorResponse('Chapter data not found', 404));
    }
    
    // Decrypt the chapter data using stored encryption key
    const decryptedData = drm.decryptChapterSegment(
      encryptedData,
      chapter.encryptionKey,
      chapter.encryptionIV,
      chapter.encryptionTag
    );
    
    // Set enhanced security headers to prevent download/caching
    res.setHeader('Content-Type', file.mimeType || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Content-Disposition', `inline; filename="${chapter.label}.mp3"`);
    
    // Chapter-specific headers
    res.setHeader('X-Chapter-Id', chapter.id.toString());
    res.setHeader('X-Chapter-Label', chapter.label);
    res.setHeader('X-Chapter-Start-Time', chapter.startTime.toString());
    res.setHeader('X-Chapter-End-Time', (chapter.endTime || 'end').toString());
    res.setHeader('X-Chapter-Duration', ((chapter.endTime || 0) - chapter.startTime).toString());
    res.setHeader('X-Secure-Stream', 'true');
    res.setHeader('X-Token-Validated', 'true');
    res.setHeader('X-Signature-Verified', 'true');
    
    // Disable range requests for individual chapters (they're already segmented)
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Content-Length', decryptedData.length);
    
    // Set CORS headers for mobile client access
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, X-Device-Fingerprint');
    res.setHeader('Access-Control-Expose-Headers', 'X-Chapter-Id, X-Chapter-Label, X-Secure-Stream, X-Token-Validated, Content-Range, Accept-Ranges');
    
    // Stream the decrypted chapter data
    res.status(200);
    res.end(decryptedData);
    
    
  } catch (error) {
    console.error('Secure chapter streaming error:', error);
    return next(new ErrorResponse('Failed to stream chapter securely', 500));
  }
});

// @desc    Generate secure signed URL for chapter streaming
// @route   POST /api/v1/files/:fileId/chapters/:chapterId/stream-url
// @access  Private
exports.generateChapterStreamUrl = asyncHandler(async (req, res, next) => {
  const fileId = parseInt(req.params.fileId);
  const chapterId = parseInt(req.params.chapterId);
  const userId = req.user.id;
  const { expiresIn = 30 * 60 * 1000 } = req.body; // 30 minutes default
  
  // Verify chapter exists and user has access
  const chapter = await prisma.audioChapter.findFirst({
    where: {
      id: chapterId,
      fileId: fileId,
      status: 'ready'
    },
    include: {
      audioFile: {
        include: {
          fileAccesses: {
            where: {
              userId: userId,
              canView: true,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } }
              ]
            }
          }
        }
      }
    }
  });
  
  if (!chapter) {
    return next(new ErrorResponse('Chapter not found or not ready for streaming', 404));
  }
  
  const file = chapter.audioFile;
  
  // Check access permissions
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const isAdmin = user && user.role === 'admin';
  
  if (!isAdmin) {
    const hasAccess = file.fileAccesses.length > 0 || file.isPublic;
    if (!hasAccess) {
      return next(new ErrorResponse('Not authorized to access this file', 403));
    }
  }
  
  // Generate JWT token for this request
  const jwtToken = jwt.sign(
    { id: userId, fileId, chapterId },
    process.env.JWT_SECRET,
    { expiresIn: Math.floor(expiresIn / 1000) + 's' }
  );
  
  // Generate signature for chapter streaming
  const expires = Date.now() + expiresIn;
  const chapterRef = `${fileId}:${chapterId}`;
  const { generateSignature } = require('../utils/signedUrl');
  
  const signature = generateSignature({
    fileRef: chapterRef,
    start: '0',
    end: '-1',
    expires,
    ip: req.ip
  });
  
  // Construct secure streaming URL
  const baseUrl = req.headers.origin || 'http://localhost:5000/api/v1';
  const secureStreamUrl = `${baseUrl}/files/${fileId}/chapters/${chapterId}/stream?` +
    `expires=${expires}&` +
    `sig=${signature}&` +
    `token=${encodeURIComponent(jwtToken)}&` +
    `start=0&end=-1`;
  
  
  res.status(200).json({
    success: true,
    data: {
      streamUrl: secureStreamUrl,
      chapterId: chapter.id,
      chapterLabel: chapter.label,
      fileId: file.id,
      fileName: file.filename,
      expiresAt: new Date(expires).toISOString(),
      expiresIn,
      isSecure: true
    }
  });
});

// @desc    Clean up temp folders (utility function)
// @route   POST /api/v1/chapters/cleanup-temp
// @access  Admin only
exports.cleanupTempFolders = asyncHandler(async (req, res, next) => {
  // Admin only
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Admin access required', 403));
  }
  
  console.log('🧹 Admin-triggered temp folder cleanup...');
  
  try {
    const tempDir = path.join(process.env.FILE_UPLOAD_PATH, performanceConfig.chapters.tempPath);
    let totalCleaned = 0;
    let totalSize = 0;
    
    if (fs.existsSync(tempDir)) {
      const tempFiles = fs.readdirSync(tempDir);
      
      for (const tempFile of tempFiles) {
        if (tempFile.startsWith('temp_')) {
          const tempFilePath = path.join(tempDir, tempFile);
          try {
            const stats = fs.statSync(tempFilePath);
            totalSize += stats.size;
            fs.unlinkSync(tempFilePath);
            totalCleaned++;
            console.log(`🧹 Cleaned temp file: ${tempFile} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
          } catch (cleanupError) {
            console.warn(`⚠️ Failed to clean temp file ${tempFile}:`, cleanupError.message);
          }
        }
      }
      
      // Try to remove empty temp directory
      try {
        const remainingFiles = fs.readdirSync(tempDir);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(tempDir);
          console.log('🧹 Removed empty temp directory');
        }
      } catch (rmdirError) {
        console.log('🧹 Temp directory not empty, keeping for future use');
      }
    }
    
    console.log(`🧹 Admin cleanup completed: ${totalCleaned} files (${(totalSize / 1024 / 1024).toFixed(2)}MB) freed`);
    
    res.status(200).json({
      success: true,
      message: `Temp cleanup completed: ${totalCleaned} files (${(totalSize / 1024 / 1024).toFixed(2)}MB) freed`,
      data: {
        filesCleaned: totalCleaned,
        sizeFreed: totalSize,
        sizeFreedMB: (totalSize / 1024 / 1024).toFixed(2)
      }
    });
    
  } catch (error) {
    console.error('Temp cleanup error:', error);
    return next(new ErrorResponse('Failed to cleanup temp folders', 500));
  }
});

// Utility function to clean up temp folders (can be called from other modules)
exports.cleanupTempFoldersUtil = async () => {
  try {
    const tempDir = path.join(process.env.FILE_UPLOAD_PATH, performanceConfig.chapters.tempPath);
    let totalCleaned = 0;
    let totalSize = 0;
    
    if (fs.existsSync(tempDir)) {
      const tempFiles = fs.readdirSync(tempDir);
      
      for (const tempFile of tempFiles) {
        if (tempFile.startsWith('temp_')) {
          const tempFilePath = path.join(tempDir, tempFile);
          try {
            const stats = fs.statSync(tempFilePath);
            totalSize += stats.size;
            fs.unlinkSync(tempFilePath);
            totalCleaned++;
          } catch (cleanupError) {
            console.warn(`⚠️ Failed to clean temp file ${tempFile}:`, cleanupError.message);
          }
        }
      }
      
      if (totalCleaned > 0) {
        console.log(`🧹 Utility cleanup: ${totalCleaned} temp files (${(totalSize / 1024 / 1024).toFixed(2)}MB) freed`);
      }
    }
    
    return { filesCleaned: totalCleaned, sizeFreed: totalSize };
  } catch (error) {
    console.error('Utility temp cleanup error:', error);
    return { filesCleaned: 0, sizeFreed: 0, error: error.message };
  }
};
