/**
 * @fileoverview MediaHandler - Handles WhatsApp media operations
 * Part of WhatsAppServiceSimple refactoring following SRP
 */

import { Message, MessageMedia } from 'whatsapp-web.js';
import { writeFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { logger } from '../../utils/logger';
import { LogExecutionTime, SafeExecutor } from '../../utils/decorators';
import { ErrorFactory } from '../../errors';
import { eventBus } from '../../events/EventBus';
import type { 
  IMediaHandler,
  MediaMetadata,
  MediaProcessingOptions,
  MediaDownloadResult,
  MediaInfo,
  SendMediaMessageRequest,
  SendMessageResponse,
  Result
} from '../../types';
import { isSuccess, isFailure } from '../../types';

/**
 * MediaHandler manages all media-related operations
 * Responsible for downloading, processing, and managing WhatsApp media files
 */
export class MediaHandler implements IMediaHandler {
  private readonly mediaStoragePath: string;
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: Set<string>;

  constructor(mediaStoragePath: string = './media') {
    this.mediaStoragePath = mediaStoragePath;
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
    this.allowedMimeTypes = new Set([
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      // Audio
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac',
      // Video
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm',
      // Documents
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ]);

    // Ensure media directory exists
    this.ensureMediaDirectory();
  }

  /**
   * Download media from a WhatsApp message by messageId (interface method)
   */
  public async downloadMedia(sessionId: string, messageId: string): Promise<MediaDownloadResult> {
    try {
      // This would require access to the WhatsApp client to get the message
      // For now, return a placeholder result
      logger.warn(`⚠️ downloadMedia called with messageId ${messageId} - requires WhatsApp client access`);
      
      return {
        success: false,
        error: 'Method requires WhatsApp client integration'
      };
    } catch (error) {
      logger.error(`❌ Failed to download media for message ${messageId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Download media from a WhatsApp message object (internal method)
   */
  @LogExecutionTime({ operationId: 'download-media-internal' })
  public async downloadMediaFromMessage(
    sessionId: string, 
    message: Message, 
    options?: MediaProcessingOptions
  ): Promise<MediaMetadata> {
    return SafeExecutor.execute(
      async () => {
        if (!message.hasMedia) {
          throw ErrorFactory.validation('Message does not contain media', 'message');
        }

        logger.info(`📥 Downloading media from message ${message.id._serialized} in session ${sessionId}`);

        // Download the media
        const media = await message.downloadMedia();
        
        // Validate media
        await this.validateMedia(media);

        // Generate file paths
        const metadata = this.generateMediaMetadata(sessionId, message, media, options);

        // Save media to disk
        await this.saveMediaToDisk(media, metadata);

        // Emit media downloaded event
        await eventBus.publish('whatsapp:media-downloaded', {
          sessionId,
          messageId: message.id._serialized,
          mediaType: metadata.type,
          filePath: metadata.filePath,
          fileSize: metadata.fileSize,
          timestamp: new Date(),
        });

        logger.info(`✅ Media downloaded successfully: ${metadata.fileName}`);
        return metadata;
      },
      {
        operationName: 'download-media',
        context: { sessionId, messageId: message.id._serialized },
        timeout: 60000, // Media downloads can take time
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to download media:`, result.error);
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Send media message (interface method)
   */
  public async sendMediaMessage(sessionId: string, request: SendMediaMessageRequest): Promise<SendMessageResponse> {
    try {
      logger.info(`📤 Preparing to send media message in session ${sessionId}`);
      
      // This would require access to the WhatsApp client
      // For now, return a placeholder result
      return {
        success: false,
        messageId: '',
        error: 'Method requires WhatsApp client integration'
      };
    } catch (error) {
      logger.error(`❌ Failed to send media message:`, error);
      return {
        success: false,
        messageId: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get media info (interface method)
   */
  public async getMediaInfo(sessionId: string, messageId: string): Promise<MediaInfo | null> {
    try {
      // This would require access to the WhatsApp client to get the message
      // For now, return null
      logger.warn(`⚠️ getMediaInfo called for message ${messageId} - requires WhatsApp client access`);
      return null;
    } catch (error) {
      logger.error(`❌ Failed to get media info for message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Delete media (interface method with adjusted signature)
   */
  public async deleteMedia(sessionId: string, mediaPath: string): Promise<void> {
    try {
      const success = await this.deleteMediaFile(mediaPath);
      if (!success) {
        throw new Error(`Failed to delete media file: ${mediaPath}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to delete media:`, error);
      throw error;
    }
  }

  /**
   * Prepare media for upload
   */
  @LogExecutionTime({ operationId: 'prepare-media-upload' })
  public async prepareMediaForUpload(
    filePath: string, 
    options?: MediaProcessingOptions
  ): Promise<MessageMedia> {
    return SafeExecutor.execute(
      async () => {
        // Validate file exists
        if (!existsSync(filePath)) {
          throw ErrorFactory.validation('Media file does not exist', 'filePath', filePath);
        }

        // Get file stats
        const stats = statSync(filePath);
        
        // Validate file size
        if (stats.size > this.maxFileSize) {
          throw ErrorFactory.validation(
            `File size exceeds maximum allowed (${this.maxFileSize} bytes)`,
            'fileSize',
            stats.size
          );
        }

        logger.info(`📤 Preparing media for upload: ${filePath}`);

        // Determine MIME type
        const mimeType = this.getMimeType(filePath);
        
        // Validate MIME type
        if (!this.allowedMimeTypes.has(mimeType)) {
          throw ErrorFactory.validation('Unsupported media type', 'mimeType', mimeType);
        }

        // Create MessageMedia object
        const messageMedia = MessageMedia.fromFilePath(filePath);
        
        // Apply options if provided
        if (options?.filename) {
          messageMedia.filename = options.filename;
        }

        logger.info(`✅ Media prepared for upload: ${basename(filePath)} (${mimeType})`);
        return messageMedia;
      },
      {
        operationName: 'prepare-media-upload',
        context: { filePath },
        timeout: 30000,
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to prepare media for upload:`, result.error);
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Get media metadata without downloading
   */
  public async getMediaMetadata(sessionId: string, message: Message): Promise<MediaMetadata | null> {
    try {
      if (!message.hasMedia) {
        return null;
      }

      const mediaInfo = (message as any)._data?.mediaData || {};
      
      return {
        messageId: message.id._serialized,
        sessionId,
        mediaType: message.type,
        type: this.normalizeMediaType(message.type),
        mimeType: mediaInfo.mimetype || 'application/octet-stream',
        fileName: `media_${message.id._serialized}`,
        filePath: '', // Will be set during download
        fileSize: mediaInfo.fileLength || 0,
        downloadedAt: null,
      };

    } catch (error) {
      logger.error(`❌ Error getting media metadata:`, error);
      return null;
    }
  }

  /**
   * Delete media file from storage (internal method)
   */
  public async deleteMediaFile(filePath: string): Promise<boolean> {
    try {
      if (!existsSync(filePath)) {
        logger.warn(`⚠️ Media file not found for deletion: ${filePath}`);
        return false;
      }

      const fs = await import('fs/promises');
      await fs.unlink(filePath);
      
      logger.info(`🗑️ Media file deleted: ${filePath}`);
      return true;

    } catch (error) {
      logger.error(`❌ Failed to delete media file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Get media storage usage statistics
   */
  public getStorageStats(): {
    totalFiles: number;
    totalSize: number;
    averageFileSize: number;
    storageByType: Record<string, { count: number; size: number }>;
  } {
    // This would typically scan the media directory
    // For now, return default values
    return {
      totalFiles: 0,
      totalSize: 0,
      averageFileSize: 0,
      storageByType: {},
    };
  }

  /**
   * Cleanup old media files
   */
  @LogExecutionTime({ operationId: 'cleanup-old-media' })
  public async cleanupOldMedia(olderThanDays: number = 30): Promise<number> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🧹 Starting media cleanup for files older than ${olderThanDays} days`);

        const fs = await import('fs/promises');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        let deletedCount = 0;

        try {
          const entries = await fs.readdir(this.mediaStoragePath, { withFileTypes: true });
          
          for (const entry of entries) {
            if (entry.isFile()) {
              const filePath = join(this.mediaStoragePath, entry.name);
              const stats = await fs.stat(filePath);
              
              if (stats.mtime < cutoffDate) {
                await fs.unlink(filePath);
                deletedCount++;
                logger.debug(`🗑️ Deleted old media file: ${entry.name}`);
              }
            }
          }
        } catch (error) {
          logger.warn(`⚠️ Error during media cleanup:`, error);
        }

        logger.info(`✅ Media cleanup completed. Deleted ${deletedCount} files`);
        return deletedCount;
      },
      {
        operationName: 'cleanup-old-media',
        context: { olderThanDays },
        timeout: 120000, // Cleanup can take time
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Media cleanup failed:`, result.error);
        return 0;
      }
      return result.data;
    });
  }

  /**
   * Validate media content and properties
   */
  private async validateMedia(media: MessageMedia): Promise<void> {
    // Check MIME type
    if (!this.allowedMimeTypes.has(media.mimetype)) {
      throw ErrorFactory.validation('Unsupported media MIME type', 'mimeType', media.mimetype);
    }

    // Check file size (base64 size approximation)
    const estimatedSize = (media.data.length * 3) / 4; // Rough base64 to binary conversion
    if (estimatedSize > this.maxFileSize) {
      throw ErrorFactory.validation(
        'Media file exceeds maximum size limit',
        'fileSize',
        estimatedSize
      );
    }

    // Basic content validation
    if (!media.data || media.data.length === 0) {
      throw ErrorFactory.validation('Media content is empty', 'mediaData');
    }

    logger.debug(`✅ Media validation passed: ${media.mimetype}, ~${Math.round(estimatedSize / 1024)}KB`);
  }

  /**
   * Generate media metadata
   */
  private generateMediaMetadata(
    sessionId: string,
    message: Message,
    media: MessageMedia,
    options?: MediaProcessingOptions
  ): MediaMetadata {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = this.getFileExtension(media.mimetype);
    const baseName = options?.filename || `media_${message.id._serialized}_${timestamp}`;
    const fileName = `${baseName}.${extension}`;
    const filePath = join(this.mediaStoragePath, sessionId, fileName);

    return {
      messageId: message.id._serialized,
      sessionId,
      mediaType: message.type,
      type: this.normalizeMediaType(message.type),
      mimeType: media.mimetype,
      fileName,
      filePath,
      fileSize: (media.data.length * 3) / 4, // Estimated binary size
      downloadedAt: new Date(),
    };
  }

  /**
   * Save media to disk
   */
  private async saveMediaToDisk(media: MessageMedia, metadata: MediaMetadata): Promise<void> {
    // Ensure session directory exists
    const sessionDir = join(this.mediaStoragePath, metadata.sessionId);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    // Convert base64 to buffer and save
    const buffer = Buffer.from(media.data, 'base64');
    writeFileSync(metadata.filePath, buffer);

    logger.debug(`💾 Media saved to disk: ${metadata.filePath}`);
  }

  /**
   * Ensure media directory exists
   */
  private ensureMediaDirectory(): void {
    if (!existsSync(this.mediaStoragePath)) {
      mkdirSync(this.mediaStoragePath, { recursive: true });
      logger.info(`📁 Created media storage directory: ${this.mediaStoragePath}`);
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtension(mimeType: string): string {
    const mimeToExtension: Record<string, string> = {
      // Images
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      // Audio
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
      // Video
      'video/mp4': 'mp4',
      'video/avi': 'avi',
      'video/mov': 'mov',
      'video/wmv': 'wmv',
      'video/webm': 'webm',
      // Documents
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'text/plain': 'txt',
      'text/csv': 'csv',
    };

    return mimeToExtension[mimeType] || 'bin';
  }

  /**
   * Normalize media type from WhatsApp Web.js
   */
  private normalizeMediaType(messageType: string): 'image' | 'audio' | 'video' | 'document' {
    switch (messageType) {
      case 'image':
        return 'image';
      case 'audio':
      case 'ptt': // Push-to-talk voice message
        return 'audio';
      case 'video':
        return 'video';
      case 'document':
      default:
        return 'document';
    }
  }

  /**
   * Get MIME type from file path
   */
  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    
    const extensionToMime: Record<string, string> = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac',
      // Video
      '.mp4': 'video/mp4',
      '.avi': 'video/avi',
      '.mov': 'video/mov',
      '.wmv': 'video/wmv',
      '.webm': 'video/webm',
      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
    };

    return extensionToMime[ext] || 'application/octet-stream';
  }

  /**
   * Check if file type is supported
   */
  public isMediaTypeSupported(mimeType: string): boolean {
    return this.allowedMimeTypes.has(mimeType);
  }

  /**
   * Get media file info
   */
  public getMediaFileInfo(filePath: string): {
    exists: boolean;
    size?: number;
    mimeType?: string;
    extension?: string;
  } {
    try {
      if (!existsSync(filePath)) {
        return { exists: false };
      }

      const stats = statSync(filePath);
      const mimeType = this.getMimeType(filePath);
      const extension = extname(filePath);

      return {
        exists: true,
        size: stats.size,
        mimeType,
        extension,
      };

    } catch (error) {
      logger.error(`❌ Error getting media file info for ${filePath}:`, error);
      return { exists: false };
    }
  }

  /**
   * Process media with optional transformations
   */
  @LogExecutionTime({ operationId: 'process-media' })
  public async processMedia(
    filePath: string, 
    options: MediaProcessingOptions
  ): Promise<string> {
    return SafeExecutor.execute(
      async () => {
        logger.info(`🔄 Processing media file: ${filePath}`);

        // For now, this is a placeholder for media processing operations
        // In a full implementation, this could include:
        // - Image resizing/compression
        // - Audio format conversion
        // - Video transcoding
        // - Document format conversion
        // - Thumbnail generation

        if (options.resize && this.isImageFile(filePath)) {
          return await this.resizeImage(filePath, options.resize);
        }

        if (options.compress) {
          const quality = typeof options.compress === 'number' ? options.compress : 0.8;
          return await this.compressMedia(filePath, quality);
        }

        // Return original file if no processing needed
        return filePath;
      },
      {
        operationName: 'process-media',
        context: { filePath },
        timeout: 120000, // Media processing can take time
      }
    ).then(result => {
      if (isFailure(result)) {
        logger.error(`❌ Failed to process media:`, result.error);
        throw result.error;
      }
      return result.data;
    });
  }

  /**
   * Check if file is an image
   */
  private isImageFile(filePath: string): boolean {
    const mimeType = this.getMimeType(filePath);
    return mimeType.startsWith('image/');
  }

  /**
   * Resize image (placeholder implementation)
   */
  private async resizeImage(filePath: string, dimensions: { width: number; height: number }): Promise<string> {
    // Placeholder for image resizing
    // In a real implementation, you would use a library like Sharp
    logger.debug(`🖼️ Resizing image ${filePath} to ${dimensions.width}x${dimensions.height}`);
    
    // For now, return original path
    return filePath;
  }

  /**
   * Compress media file (placeholder implementation)
   */
  private async compressMedia(filePath: string, quality: number): Promise<string> {
    // Placeholder for media compression
    // In a real implementation, you would use appropriate compression libraries
    logger.debug(`🗜️ Compressing media ${filePath} with quality ${quality}`);
    
    // For now, return original path
    return filePath;
  }
}
