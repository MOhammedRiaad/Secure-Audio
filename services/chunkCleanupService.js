const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const performanceConfig = require('../config/performance');

const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'pretty'
});

class ChunkCleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupInterval = null;
    this.lastCleanup = null;
    this.cleanupStats = {
      totalRuns: 0,
      totalChunksCleaned: 0,
      totalTempFilesCleaned: 0,
      totalSizeFreed: 0,
      lastRunTime: null,
      errors: []
    };
    
    // Start scheduled cleanup
    this.startScheduledCleanup();
  }

  // Start scheduled cleanup service
  startScheduledCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Run cleanup every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.runScheduledCleanup();
    }, 30 * 60 * 1000); // 30 minutes
    
    console.log('🕐 Scheduled chunk cleanup service started (every 30 minutes)');
    
    // Run initial cleanup after 5 minutes
    setTimeout(() => {
      this.runScheduledCleanup();
    }, 5 * 60 * 1000);
  }

  // Run scheduled cleanup
  async runScheduledCleanup() {
    if (this.isRunning) {
      console.log('⏳ Cleanup already running, skipping scheduled run');
      return;
    }
    
    console.log('🕐 Running scheduled cleanup...');
    await this.cleanupAll();
  }

  // Stop scheduled cleanup service
  stopScheduledCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('🛑 Scheduled chunk cleanup service stopped');
    }
  }

  // Clean up all types of temporary files
  async cleanupAll() {
    if (this.isRunning) {
      console.log('⏳ Cleanup already running');
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      console.log('🧹 Starting comprehensive cleanup process...');
      
      // Clean up chunk upload sessions
      const chunkResults = await this.cleanupChunkSessions();
      
      // Clean up temp folders
      const tempResults = await this.cleanupTempFolders();
      
      // Clean up orphaned files
      const orphanedResults = await this.cleanupOrphanedFiles();
      
      // Update stats
      this.cleanupStats.totalRuns++;
      this.cleanupStats.totalChunksCleaned += chunkResults.chunksCleaned;
      this.cleanupStats.totalTempFilesCleaned += tempResults.filesCleaned;
      this.cleanupStats.totalSizeFreed += chunkResults.sizeFreed + tempResults.sizeFreed + orphanedResults.sizeFreed;
      this.cleanupStats.lastRunTime = new Date();
      
      const totalSizeMB = (this.cleanupStats.totalSizeFreed / 1024 / 1024).toFixed(2);
      const runTime = Date.now() - startTime;
      
      console.log(`🎉 Comprehensive cleanup completed in ${runTime}ms`);
      console.log(`📊 Total stats: ${this.cleanupStats.totalRuns} runs, ${totalSizeMB}MB freed`);
      console.log(`📊 This run: ${chunkResults.chunksCleaned} chunks, ${tempResults.filesCleaned} temp files, ${orphanedResults.filesCleaned} orphaned files`);
      
    } catch (error) {
      console.error('❌ Comprehensive cleanup error:', error);
      this.cleanupStats.errors.push({
        timestamp: new Date(),
        error: error.message
      });
    } finally {
      this.isRunning = false;
      this.lastCleanup = Date.now();
    }
  }

  // Clean up temp folders (chapters, uploads, etc.)
  async cleanupTempFolders() {
    console.log('🧹 Cleaning up temp folders...');
    
    const tempPaths = [
      path.join(process.env.FILE_UPLOAD_PATH, performanceConfig.chapters.tempPath),
      path.join(process.env.FILE_UPLOAD_PATH, 'temp'),
      path.join(process.env.FILE_UPLOAD_PATH, 'uploads', 'temp')
    ];
    
    let totalCleaned = 0;
    let totalSize = 0;
    
    for (const tempPath of tempPaths) {
      if (fs.existsSync(tempPath)) {
        try {
          const results = await this.cleanupDirectory(tempPath, 'temp_');
          totalCleaned += results.filesCleaned;
          totalSize += results.sizeFreed;
        } catch (error) {
          console.warn(`⚠️ Failed to clean temp path ${tempPath}:`, error.message);
        }
      }
    }
    
    console.log(`🧹 Temp folders cleanup: ${totalCleaned} files (${(totalSize / 1024 / 1024).toFixed(2)}MB) freed`);
    
    return { filesCleaned: totalCleaned, sizeFreed: totalSize };
  }

  // Clean up orphaned files (files without database records)
  async cleanupOrphanedFiles() {
    console.log('🧹 Cleaning up orphaned files...');
    
    const uploadPath = process.env.FILE_UPLOAD_PATH;
    const chaptersPath = path.join(uploadPath, performanceConfig.chapters.chapterStoragePath);
    
    let totalCleaned = 0;
    let totalSize = 0;
    
    // Clean orphaned chapter files
    if (fs.existsSync(chaptersPath)) {
      try {
        const results = await this.cleanupOrphanedChapters(chaptersPath);
        totalCleaned += results.filesCleaned;
        totalSize += results.sizeFreed;
      } catch (error) {
        console.warn('⚠️ Failed to clean orphaned chapters:', error.message);
      }
    }
    
    console.log(`🧹 Orphaned files cleanup: ${totalCleaned} files (${(totalSize / 1024 / 1024).toFixed(2)}MB) freed`);
    
    return { filesCleaned: totalCleaned, sizeFreed: totalSize };
  }

  // Clean up orphaned chapter files
  async cleanupOrphanedChapters(chaptersPath) {
    const chapterFiles = fs.readdirSync(chaptersPath);
    let cleaned = 0;
    let sizeFreed = 0;
    
    for (const chapterFile of chapterFiles) {
      if (chapterFile.endsWith('.enc')) {
        try {
          // Extract chapter ID from filename
          const match = chapterFile.match(/chapter_(\d+)_(\d+)_/);
          if (match) {
            const [, fileId, chapterId] = match;
            
            // Check if chapter exists in database
            const chapter = await prisma.audioChapter.findFirst({
              where: {
                id: parseInt(chapterId),
                fileId: parseInt(fileId)
              }
            });
            
            if (!chapter) {
              // Orphaned file, clean it up
              const filePath = path.join(chaptersPath, chapterFile);
              const stats = fs.statSync(filePath);
              fs.unlinkSync(filePath);
              sizeFreed += stats.size;
              cleaned++;
              console.log(`🧹 Cleaned orphaned chapter file: ${chapterFile} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process chapter file ${chapterFile}:`, error.message);
        }
      }
    }
    
    return { filesCleaned: cleaned, sizeFreed };
  }

  // Clean up expired chunk upload sessions
  async cleanupChunkSessions() {
    console.log('🧹 Cleaning up expired chunk upload sessions...');
    
    try {
      const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
      
      // Find expired sessions
      const expiredSessions = await prisma.chunkUploadSession.findMany({
        where: {
          OR: [
            { createdAt: { lt: cutoffTime } },
            { 
              status: 'failed', 
              updatedAt: { lt: new Date(Date.now() - (2 * 60 * 60 * 1000)) } // 2 hours for failed
            }
          ]
        }
      });
      
      let chunksCleaned = 0;
      let sizeFreed = 0;
      
      for (const session of expiredSessions) {
        try {
          // Clean up chunk files
          const chunksDir = path.join(process.env.CHUNKS_UPLOAD_PATH || './chunks', session.uploadId);
          if (fs.existsSync(chunksDir)) {
            const results = await this.cleanupDirectory(chunksDir);
            chunksCleaned += results.filesCleaned;
            sizeFreed += results.sizeFreed;
          }
          
          // Clean up metadata
          const metadataFile = path.join('./uploads/metadata', `${session.uploadId}.json`);
          if (fs.existsSync(metadataFile)) {
            const stats = fs.statSync(metadataFile);
            fs.unlinkSync(metadataFile);
            sizeFreed += stats.size;
          }
          
        } catch (error) {
          console.warn(`⚠️ Failed to clean session ${session.uploadId}:`, error.message);
        }
      }
      
      // Delete expired sessions from database
      if (expiredSessions.length > 0) {
        await prisma.chunkUploadSession.deleteMany({
          where: {
            uploadId: {
              in: expiredSessions.map(s => s.uploadId)
            }
          }
        });
      }
      
      console.log(`🧹 Chunk sessions cleanup: ${chunksCleaned} chunks, ${expiredSessions.length} sessions (${(sizeFreed / 1024 / 1024).toFixed(2)}MB) freed`);
      
      return { chunksCleaned, sizeFreed };
      
    } catch (error) {
      console.error('❌ Chunk sessions cleanup error:', error);
      return { chunksCleaned: 0, sizeFreed: 0 };
    }
  }

  // Clean up a specific directory
  async cleanupDirectory(dirPath, filePrefix = '') {
    if (!fs.existsSync(dirPath)) {
      return { filesCleaned: 0, sizeFreed: 0 };
    }
    
    const files = fs.readdirSync(dirPath);
    let cleaned = 0;
    let sizeFreed = 0;
    
    for (const file of files) {
      if (filePrefix === '' || file.startsWith(filePrefix)) {
        const filePath = path.join(dirPath, file);
        try {
          const stats = fs.statSync(filePath);
          
          // Clean up files older than 1 hour
          const oneHourAgo = Date.now() - (60 * 60 * 1000);
          if (stats.mtime.getTime() < oneHourAgo) {
            fs.unlinkSync(filePath);
            sizeFreed += stats.size;
            cleaned++;
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process file ${file}:`, error.message);
        }
      }
    }
    
    // Try to remove empty directory
    try {
      const remainingFiles = fs.readdirSync(dirPath);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(dirPath);
        console.log(`🧹 Removed empty directory: ${dirPath}`);
      }
    } catch (error) {
      // Directory not empty or permission issue - that's fine
    }
    
    return { filesCleaned: cleaned, sizeFreed };
  }

  // Get cleanup service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCleanup: this.lastCleanup,
      nextCleanup: this.lastCleanup ? new Date(this.lastCleanup.getTime() + (30 * 60 * 1000)) : null,
      stats: this.cleanupStats
    };
  }

  // Manual cleanup trigger
  async manualCleanup() {
    console.log('🧹 Manual cleanup triggered');
    return await this.cleanupAll();
  }
}

// Create singleton instance
const chunkCleanupService = new ChunkCleanupService();

module.exports = chunkCleanupService;