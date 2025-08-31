const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class ChunkCleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupJob = null;
    
    // Default cleanup settings
    this.settings = {
      // Clean up chunks older than 24 hours
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      
      // Run cleanup every 6 hours
      cronSchedule: '0 */6 * * *', // Every 6 hours
      
      // Temporary chunk upload directory (NOT the main uploads directory)
      chunksDir: process.env.CHUNKS_UPLOAD_PATH || path.join(process.cwd(), 'chunks'),
      
      // Metadata directory for temporary upload metadata
      metadataDir: path.join(process.cwd(), 'uploads', 'metadata'),
      
      // Maximum number of files to clean per run
      maxFilesPerRun: 100,
      
      // IMPORTANT: Main uploads directory is NEVER cleaned by this service
      // The main encrypted audio files are stored in process.env.FILE_UPLOAD_PATH || './uploads'
      // and should NEVER be deleted by the cleanup service
    };
  }

  /**
   * Start the cleanup service
   */
  start() {
    if (this.isRunning) {
      console.log('Chunk cleanup service is already running');
      return;
    }

    console.log('Starting chunk cleanup service...');
    
    // Schedule periodic cleanup
    this.cleanupJob = cron.schedule(this.settings.cronSchedule, async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        console.error('Error during scheduled cleanup:', error);
      }
    }, {
      scheduled: false
    });

    this.cleanupJob.start();
    this.isRunning = true;
    
    console.log(`Chunk cleanup service started. Next cleanup scheduled: ${this.settings.cronSchedule}`);
    
    // Perform initial cleanup
    this.performCleanup().catch(error => {
      console.error('Error during initial cleanup:', error);
    });
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (!this.isRunning) {
      console.log('Chunk cleanup service is not running');
      return;
    }

    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
    }

    this.isRunning = false;
    console.log('Chunk cleanup service stopped');
  }

  /**
   * Perform cleanup of expired chunks and metadata
   * IMPORTANT: This only cleans temporary chunk files and metadata,
   * NEVER the main encrypted audio files in the uploads directory
   */
  async performCleanup() {
    console.log('Starting chunk cleanup process (temporary files only)...');
    console.log(`Cleaning chunks directory: ${this.settings.chunksDir}`);
    console.log('IMPORTANT: Main encrypted audio files in uploads directory are preserved');
    
    const startTime = Date.now();
    let cleanedFiles = 0;
    let cleanedDirs = 0;
    let errors = 0;

    try {
      // Clean up expired upload sessions from database
      const expiredSessions = await this.cleanupExpiredSessions();
      
      // Clean up orphaned chunk files (temporary files only)
      const orphanedChunks = await this.cleanupOrphanedChunks();
      
      // Clean up empty directories
      const emptyDirs = await this.cleanupEmptyDirectories();
      
      cleanedFiles = expiredSessions.deletedChunks + orphanedChunks;
      cleanedDirs = emptyDirs;
      
      const duration = Date.now() - startTime;
      
      console.log(`Chunk cleanup completed in ${duration}ms:`);
      console.log(`- Expired sessions: ${expiredSessions.deletedSessions}`);
      console.log(`- Cleaned chunk files: ${cleanedFiles}`);
      console.log(`- Cleaned directories: ${cleanedDirs}`);
      console.log(`- Errors: ${errors}`);
      
    } catch (error) {
      console.error('Error during cleanup process:', error);
      errors++;
    }

    return {
      cleanedFiles,
      cleanedDirs,
      errors,
      duration: Date.now() - startTime
    };
  }

  /**
   * Clean up expired upload sessions from database
   */
  async cleanupExpiredSessions() {
    const cutoffTime = new Date(Date.now() - this.settings.maxAge);
    
    try {
      // Find expired upload sessions
      const expiredSessions = await prisma.chunkUploadSession.findMany({
        where: {
          OR: [
            {
              createdAt: {
                lt: cutoffTime
              }
            },
            {
              status: 'failed',
              updatedAt: {
                lt: new Date(Date.now() - (2 * 60 * 60 * 1000)) // 2 hours for failed uploads
              }
            }
          ]
        },
        take: this.settings.maxFilesPerRun
      });

      let deletedChunks = 0;
      
      for (const session of expiredSessions) {
        try {
          // Delete chunk files for this session
          const sessionChunksDir = path.join(this.settings.chunksDir, session.uploadId);
          const chunkCount = await this.deleteDirectory(sessionChunksDir);
          deletedChunks += chunkCount;
          
          // Delete metadata file
          const metadataFile = path.join(this.settings.metadataDir, `${session.uploadId}.json`);
          await this.deleteFile(metadataFile);
          
        } catch (error) {
          console.error(`Error cleaning session ${session.uploadId}:`, error);
        }
      }

      // Delete expired sessions from database
      const deleteResult = await prisma.chunkUploadSession.deleteMany({
        where: {
          uploadId: {
            in: expiredSessions.map(s => s.uploadId)
          }
        }
      });

      return {
        deletedSessions: deleteResult.count,
        deletedChunks
      };
      
    } catch (error) {
      console.error('Error cleaning expired sessions:', error);
      return { deletedSessions: 0, deletedChunks: 0 };
    }
  }

  /**
   * Clean up orphaned chunk files (files without corresponding database entries)
   */
  async cleanupOrphanedChunks() {
    let deletedFiles = 0;
    
    try {
      // SAFETY CHECK: Ensure we're only cleaning the chunks directory
      const chunksDir = this.settings.chunksDir;
      console.log(`Cleaning orphaned chunks from: ${chunksDir}`);
      
      // Verify this is actually the chunks directory and not the main uploads
      if (chunksDir.includes('uploads') && !chunksDir.includes('chunks')) {
        console.error('SAFETY ERROR: Attempted to clean main uploads directory. Aborting.');
        return deletedFiles;
      }
      
      // Check if chunks directory exists
      const chunksExist = await this.directoryExists(chunksDir);
      if (!chunksExist) {
        console.log('Chunks directory does not exist, skipping cleanup');
        return deletedFiles;
      }

      const uploadDirs = await fs.readdir(chunksDir);
      
      for (const uploadId of uploadDirs) {
        try {
          // Check if this upload session exists in database
          const session = await prisma.chunkUploadSession.findUnique({
            where: { uploadId }
          });
          
          if (!session) {
            // Orphaned directory - delete it (temporary chunks only)
            const uploadDir = path.join(this.settings.chunksDir, uploadId);
            const fileCount = await this.deleteDirectory(uploadDir);
            deletedFiles += fileCount;
            
            console.log(`Deleted orphaned chunk directory: ${uploadId} (${fileCount} temporary files)`);
          }
          
        } catch (error) {
          console.error(`Error checking upload directory ${uploadId}:`, error);
        }
      }
      
    } catch (error) {
      console.error('Error cleaning orphaned chunks:', error);
    }
    
    return deletedFiles;
  }

  /**
   * Clean up empty directories
   */
  async cleanupEmptyDirectories() {
    let deletedDirs = 0;
    
    try {
      // Clean chunks directory
      deletedDirs += await this.removeEmptyDirectories(this.settings.chunksDir);
      
      // Clean metadata directory
      deletedDirs += await this.removeEmptyDirectories(this.settings.metadataDir);
      
    } catch (error) {
      console.error('Error cleaning empty directories:', error);
    }
    
    return deletedDirs;
  }

  /**
   * Remove empty directories recursively
   */
  async removeEmptyDirectories(dirPath) {
    let deletedCount = 0;
    
    try {
      const exists = await this.directoryExists(dirPath);
      if (!exists) {
        return deletedCount;
      }

      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          // Recursively clean subdirectory
          deletedCount += await this.removeEmptyDirectories(itemPath);
          
          // Check if directory is now empty
          const subItems = await fs.readdir(itemPath);
          if (subItems.length === 0) {
            await fs.rmdir(itemPath);
            deletedCount++;
            console.log(`Removed empty directory: ${itemPath}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`Error removing empty directories from ${dirPath}:`, error);
    }
    
    return deletedCount;
  }

  /**
   * Delete a directory and all its contents
   */
  async deleteDirectory(dirPath) {
    let deletedFiles = 0;
    
    try {
      const exists = await this.directoryExists(dirPath);
      if (!exists) {
        return deletedFiles;
      }

      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          deletedFiles += await this.deleteDirectory(itemPath);
        } else {
          await fs.unlink(itemPath);
          deletedFiles++;
        }
      }
      
      await fs.rmdir(dirPath);
      
    } catch (error) {
      console.error(`Error deleting directory ${dirPath}:`, error);
    }
    
    return deletedFiles;
  }

  /**
   * Delete a single file
   */
  async deleteFile(filePath) {
    try {
      const exists = await this.fileExists(filePath);
      if (exists) {
        await fs.unlink(filePath);
        return true;
      }
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
    }
    return false;
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a directory exists
   */
  async directoryExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Manual cleanup trigger (for API endpoint)
   * IMPORTANT: This only cleans temporary chunk files and metadata,
   * NEVER the main encrypted audio files in the uploads directory
   */
  async manualCleanup() {
    console.log('Manual cleanup triggered - cleaning temporary files only');
    return await this.performCleanup();
  }

  /**
   * Get cleanup service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      settings: this.settings,
      nextRun: this.cleanupJob ? this.cleanupJob.nextDate() : null
    };
  }

  /**
   * Update cleanup settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // Restart service if running to apply new schedule
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

// Create singleton instance
const chunkCleanupService = new ChunkCleanupService();

module.exports = chunkCleanupService;