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

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty'
});
const drm = new AudioDRM();

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
    console.log(`Fetching chapters for fileId: ${fileId} (type: ${typeof fileId})`);
    
    // First, try a simple count to test the connection
    const chapterCount = await prisma.audioChapter.count({
      where: { fileId: fileId }
    });
    
    console.log(`Found ${chapterCount} chapters for file ${fileId}`);
    
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
  const maxConcurrent = performanceConfig.chapters.maxConcurrentChapters;

  try {
    console.log(`🚀 Starting chapter finalization for file ${file.filename} with ${file.chapters.length} chapters`);
    console.log(`⚙️ Using max ${maxConcurrent} concurrent processing`);
    
    // Process chapters in batches for better memory management
    for (let i = 0; i < file.chapters.length; i += maxConcurrent) {
      const batch = file.chapters.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (chapter) => {
        try {
          console.log(`📖 Processing chapter: ${chapter.label} (${chapter.startTime}s - ${chapter.endTime || 'end'}s)`);
          
          // Extract audio segment from master file
          const segmentBuffer = await drm.extractAudioSegment(
            masterFilePath,
            chapter.startTime,
            chapter.endTime,
            file.encryptionKey
          );
          
          console.log(`✂️ Extracted ${segmentBuffer.length} bytes for chapter ${chapter.label}`);
          
          // Encrypt the individual chapter segment
          const encryptionResult = drm.encryptChapterSegment(segmentBuffer);
          
          console.log(`🔐 Encrypted chapter ${chapter.label}: ${encryptionResult.encryptedSize} bytes`);
          
          // Intelligent storage strategy based on size
          let selectedStorageType = storageType || performanceConfig.chapters.defaultStorageType;
          
          if (!storageType) {
            // Auto-select based on size thresholds
            if (encryptionResult.encryptedSize <= performanceConfig.chapters.databaseStorageThreshold) {
              selectedStorageType = 'database';
            } else {
              selectedStorageType = 'filesystem';
            }
          }
          
          // Prepare update data
          const updateData = {
            status: 'ready',
            encryptionKey: encryptionResult.key,
            encryptionIV: encryptionResult.iv,
            encryptionTag: encryptionResult.authTag,
            plainSize: encryptionResult.plainSize,
            encryptedSize: encryptionResult.encryptedSize,
            finalizedAt: new Date()
          };
          
          // Handle storage based on strategy
          if (selectedStorageType === 'filesystem') {
            // Save encrypted chapter to filesystem
            const chapterFileName = `chapter_${fileId}_${chapter.id}_${Date.now()}.enc`;
            const chapterFilePath = path.join(process.env.FILE_UPLOAD_PATH, performanceConfig.chapters.chapterStoragePath, chapterFileName);
            
            // Ensure chapters directory exists
            const chaptersDir = path.dirname(chapterFilePath);
            if (!fs.existsSync(chaptersDir)) {
              fs.mkdirSync(chaptersDir, { recursive: true });
            }
            
            fs.writeFileSync(chapterFilePath, encryptionResult.encryptedData);
            updateData.encryptedPath = path.join(performanceConfig.chapters.chapterStoragePath, chapterFileName);
            
            console.log(`💾 Saved chapter ${chapter.label} to filesystem: ${chapterFileName} (${selectedStorageType})`);
          } else {
            // Store encrypted data directly in database (BYTEA)
            updateData.encryptedData = encryptionResult.encryptedData;
            
            console.log(`🗃️ Stored chapter ${chapter.label} in database (${encryptionResult.encryptedSize} bytes) (${selectedStorageType})`);
          }
          
          // Update chapter record
          const updatedChapter = await prisma.audioChapter.update({
            where: { id: chapter.id },
            data: updateData
          });
          
          // Trigger garbage collection for large operations
          if (performanceConfig.memory.enableGcHints && 
              encryptionResult.encryptedSize > performanceConfig.memory.gcThreshold) {
            if (global.gc) {
              global.gc();
              console.log(`🗑️ Triggered garbage collection after processing large chapter`);
            }
          }
          
          return {
            success: true,
            chapter: {
              id: updatedChapter.id,
              label: updatedChapter.label,
              status: updatedChapter.status,
              plainSize: updatedChapter.plainSize,
              encryptedSize: updatedChapter.encryptedSize,
              storageType: selectedStorageType,
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
      
      console.log(`🏁 Completed batch ${Math.floor(i / maxConcurrent) + 1}: ${totalProcessed}/${file.chapters.length} chapters processed`);
      
      // Brief pause between batches to prevent overwhelming the system
      if (i + maxConcurrent < file.chapters.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const successCount = finalizedChapters.length;
    const errorCount = errors.length;
    
    // Calculate storage distribution
    const storageStats = finalizedChapters.reduce((acc, chapter) => {
      acc[chapter.storageType] = (acc[chapter.storageType] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`🎯 Chapter finalization completed: ${successCount} success, ${errorCount} errors`);
    console.log(`📈 Storage distribution:`, storageStats);
    
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
          maxConcurrentUsed: maxConcurrent
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
  
  console.log(`🔐 Chapter streaming security validation passed for user ${userId}, chapter ${chapterId}`);
  
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
      console.log(`🗃️ Secure streaming chapter ${chapter.label} from database (${encryptedData.length} bytes)`);
    } else if (chapter.encryptedPath) {
      // Data stored in filesystem - use streaming for large files
      const chapterFilePath = path.join(process.env.FILE_UPLOAD_PATH, chapter.encryptedPath);
      
      if (!fs.existsSync(chapterFilePath)) {
        return next(new ErrorResponse('Chapter file not found on disk', 404));
      }
      
      // For large files, stream directly instead of loading into memory
      const stats = fs.statSync(chapterFilePath);
      if (stats.size > 50 * 1024 * 1024) { // 50MB threshold
        console.log(`💾 Secure streaming large chapter ${chapter.label} directly from filesystem (${stats.size} bytes)`);
        
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
        
        console.log(`✅ Started secure streaming large chapter: ${chapter.label} to user ${userId}`);
        return;
      }
      
      // For smaller files, load into memory (original approach)
      encryptedData = fs.readFileSync(chapterFilePath);
      console.log(`💾 Secure streaming chapter ${chapter.label} from filesystem (${encryptedData.length} bytes)`);
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
    
    // Stream the decrypted chapter data
    res.status(200);
    res.end(decryptedData);
    
    console.log(`✅ Successfully streamed secure chapter: ${chapter.label} to user ${userId}`);
    
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
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';
  const secureStreamUrl = `${baseUrl}/files/${fileId}/chapters/${chapterId}/stream?` +
    `expires=${expires}&` +
    `sig=${signature}&` +
    `token=${encodeURIComponent(jwtToken)}&` +
    `start=0&end=-1`;
  
  console.log(`🔗 Generated secure chapter stream URL for chapter ${chapter.label} (expires in ${Math.floor(expiresIn/1000/60)} minutes)`);
  
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
