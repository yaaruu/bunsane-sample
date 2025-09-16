# Bunsane Upload System - Complete Documentation

## Overview

The Bunsane Upload System provides a comprehensive, secure, and scalable solution for handling file uploads in your Bunsane applications. It follows a modular architecture with pluggable storage backends, comprehensive validation, and seamless GraphQL integration.

## Quick Start

### 1. Basic Setup

```typescript
import { QuickSetup } from "bunsane/upload";

// Initialize for general uploads
await QuickSetup.basic();

// Or initialize specifically for images with optimized settings
await QuickSetup.forImages();
```

### 2. Simple Upload in GraphQL

```typescript
import { Upload } from "bunsane/upload";

class MyService extends BaseService {
    @GraphQLOperation({
        type: "Mutation",
        input: { 
            file: "Upload!" as GraphQLType 
        },
        output: "String"
    })
    @Upload()
    async uploadFile(args: { file: File }): Promise<string> {
        // File is automatically processed and available as File object
        return "Upload successful!";
    }
}
```

### 3. Upload with Entity Integration

```typescript
import { UploadHelper, UploadComponent } from "bunsane/upload";

// Process upload and attach to entity
const entity = MyArcheType.createEntity();
const result = await UploadHelper.processUploadForEntity(
    file, 
    entity, 
    IMAGE_UPLOAD_CONFIG
);
```

## Architecture

### Core Components

1. **UploadManager** - Singleton coordinator for all upload operations
2. **StorageProvider** - Abstract interface for storage backends (local, S3, etc.)
3. **FileValidator** - Security-focused validation system
4. **UploadComponent** - Entity component for storing upload metadata
5. **GraphQL Decorators** - Seamless GraphQL integration

### Storage Architecture

The system uses the Strategy pattern for storage backends:

```typescript
interface StorageProvider {
    store(file: File, path: string, options?: any): Promise<UploadResult>;
    delete(path: string): Promise<boolean>;
    getUrl(path: string): Promise<string>;
    copy(fromPath: string, toPath: string): Promise<boolean>;
    move(fromPath: string, toPath: string): Promise<boolean>;
}
```

Current implementations:
- **LocalStorageProvider** - File system storage
- Extensible to cloud providers (S3, Azure Blob, Google Cloud Storage)

## Configuration

### Upload Configuration Types

```typescript
interface UploadConfiguration {
    maxFileSize: number;           // Maximum file size in bytes
    allowedMimeTypes: string[];    // Allowed MIME types
    allowedExtensions: string[];   // Allowed file extensions
    uploadDir: string;             // Upload directory
    generateUniqueNames: boolean;  // Generate unique filenames
    preserveOriginalName: boolean; // Keep original filename in metadata
    enableSecurity: boolean;       // Enable security validation
    storageProvider: string;       // Storage provider to use
}
```

### Predefined Configurations

```typescript
import { IMAGE_UPLOAD_CONFIG, DOCUMENT_UPLOAD_CONFIG, BASIC_UPLOAD_CONFIG } from "bunsane/upload";

// Image uploads (PNG, JPG, GIF, WebP, SVG)
const imageConfig = IMAGE_UPLOAD_CONFIG;

// Document uploads (PDF, DOC, TXT, etc.)
const docConfig = DOCUMENT_UPLOAD_CONFIG;

// Basic uploads (most file types)
const basicConfig = BASIC_UPLOAD_CONFIG;
```

### Custom Configuration

```typescript
const customConfig: UploadConfiguration = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    allowedExtensions: ['.jpg', '.jpeg', '.png'],
    uploadDir: './uploads/images',
    generateUniqueNames: true,
    preserveOriginalName: true,
    enableSecurity: true,
    storageProvider: 'local'
};
```

## GraphQL Integration

### Upload Decorators

#### @Upload() - Basic Upload Processing

```typescript
@Upload()
async uploadFile(args: { file: File }): Promise<string> {
    // File is processed and validated automatically
    return args.file.name;
}
```

#### @UploadField() - Custom Field Processing

```typescript
@UploadField('profilePicture', IMAGE_UPLOAD_CONFIG)
async updateProfile(args: { profilePicture: File, name: string }): Promise<User> {
    // Only the profilePicture field is processed as upload
    // Other fields remain unchanged
}
```

#### @UploadToEntity() - Direct Entity Integration

```typescript
@UploadToEntity(UserArcheType, 'avatarImage', IMAGE_UPLOAD_CONFIG)
async updateAvatar(args: { userId: string, avatarImage: File }): Promise<User> {
    // Upload is automatically attached to the user entity
    // Returns the updated entity
}
```

#### Custom Upload Processing

```typescript
@GraphQLOperation({
    type: "Mutation",
    input: { files: "[Upload]!" as GraphQLType },
    output: "BatchUploadResult"
})
async batchUpload(args: { files: File[] }): Promise<any> {
    const uploadManager = UploadManager.getInstance();
    const results = await uploadManager.uploadFiles(args.files, IMAGE_UPLOAD_CONFIG);
    
    return {
        totalFiles: results.length,
        successfulUploads: results.filter(r => r.success).length,
        failedUploads: results.filter(r => !r.success).length,
        errors: results.filter(r => !r.success).map(r => r.error?.message)
    };
}
```

## Entity Integration

### Upload Component

The `UploadComponent` stores upload metadata on entities:

```typescript
interface UploadComponentData {
    uploadId: string;           // Unique upload identifier
    fileName: string;           // Current filename
    originalFileName: string;   // Original uploaded filename
    mimeType: string;          // File MIME type
    size: number;              // File size in bytes
    path: string;              // Storage path
    url: string;               // Access URL
    uploadedAt: string;        // Upload timestamp
    metadata: string;          // JSON metadata
}
```

### Usage Examples

```typescript
// Add upload to entity
entity.add(UploadComponent, {
    uploadId: result.uploadId!,
    fileName: result.fileName!,
    originalFileName: result.originalFileName!,
    mimeType: result.mimeType!,
    size: result.size!,
    path: result.path!,
    url: result.url!,
    uploadedAt: new Date().toISOString(),
    metadata: JSON.stringify(result.metadata || {})
});

// Access upload data
const uploadData = await entity.get(UploadComponent);
console.log(`File URL: ${uploadData?.url}`);
console.log(`File size: ${uploadData?.size} bytes`);
```

### Helper Functions

```typescript
import { UploadHelper } from "bunsane/upload";

// Process upload for entity
const result = await UploadHelper.processUploadForEntity(
    file, 
    entity, 
    config
);

// Get entity storage usage
const totalSize = await UploadHelper.getEntityStorageUsage(entity);

// Get entity upload URLs
const urls = await UploadHelper.getEntityUploadUrls(entity);

// Generate secure filename
const filename = UploadHelper.generateSecureFilename(originalName, '.jpg');

// Extract file metadata
const metadata = await UploadHelper.extractFileMetadata(file);
```

## Image Processing

### Image Metadata Component

For images, use `ImageMetadataComponent` to store additional image-specific data:

```typescript
interface ImageMetadataComponentData {
    width: number;           // Image width in pixels
    height: number;          // Image height in pixels
    colorDepth: number;      // Color depth
    hasAlpha: boolean;       // Has alpha channel
    isAnimated: boolean;     // Is animated (GIF)
    thumbnails: string;      // JSON array of thumbnail info
}
```

### Image Processing Pipeline

```typescript
import { ImageProcessor } from "bunsane/upload";

const processor = new ImageProcessor();

// Generate thumbnails
const thumbnails = await processor.generateThumbnails(file, [
    { width: 150, height: 150, suffix: 'thumb' },
    { width: 300, height: 300, suffix: 'medium' },
    { width: 800, height: 600, suffix: 'large' }
]);

// Optimize image
const optimized = await processor.optimizeImage(file, {
    quality: 0.85,
    progressive: true,
    mozjpeg: true
});

// Extract EXIF data
const exifData = await processor.extractExifData(file);
```

## Security Features

### File Validation

The system includes comprehensive security validation:

1. **Magic Number Validation** - Checks file signatures
2. **MIME Type Validation** - Validates MIME types
3. **Extension Validation** - Checks file extensions
4. **Size Validation** - Enforces size limits
5. **Security Scanning** - Detects potentially dangerous files

### Security Configuration

```typescript
const secureConfig: UploadConfiguration = {
    maxFileSize: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    allowedExtensions: ['.jpg', '.jpeg', '.png'],
    uploadDir: './secure-uploads',
    generateUniqueNames: true,
    preserveOriginalName: false,
    enableSecurity: true,  // Enable all security checks
    storageProvider: 'local'
};
```

### Custom Validation

```typescript
import { FileValidator } from "bunsane/upload";

const validator = new FileValidator();

// Validate file
const result = await validator.validate(file, config);
if (!result.isValid) {
    console.log('Validation errors:', result.errors);
    console.log('Security issues:', result.securityIssues);
}

// Custom validation
const isCustomValid = await validator.customValidate(file, (file) => {
    // Custom validation logic
    return file.size < 1000000; // 1MB limit
});
```

## Advanced Examples

### Example 1: Gallery System with Batch Upload

See `ImageGalleryService.ts` for a complete example showing:
- Batch file uploads
- Gallery management
- Image metadata handling
- Entity relationships
- Advanced GraphQL resolvers

### Example 2: Post Service with Image Upload

See `PostServiceRefactored.ts` for an example showing:
- Migration from manual upload handling
- GraphQL field resolvers
- Image processing integration
- Error handling patterns

### Example 3: Custom Storage Provider

```typescript
import { StorageProvider, UploadResult } from "bunsane/upload";

class S3StorageProvider implements StorageProvider {
    async store(file: File, path: string): Promise<UploadResult> {
        // Implementation for AWS S3 upload
        // Return UploadResult with S3 URL
    }
    
    async delete(path: string): Promise<boolean> {
        // Implementation for S3 deletion
    }
    
    async getUrl(path: string): Promise<string> {
        // Return S3 presigned URL or public URL
    }
    
    async copy(fromPath: string, toPath: string): Promise<boolean> {
        // S3 copy implementation
    }
    
    async move(fromPath: string, toPath: string): Promise<boolean> {
        // S3 move implementation
    }
}

// Register custom provider
const uploadManager = UploadManager.getInstance();
uploadManager.registerStorageProvider('s3', new S3StorageProvider());
```

## Migration Guide

### From Manual Upload Handling

**Before:**
```typescript
async createPost(args: any): Promise<Entity> {
    // Manual file handling
    if (args.image) {
        const imageBuffer = await args.image.arrayBuffer();
        const imagePath = `./uploads/${Date.now()}-${args.image.name}`;
        await Bun.write(imagePath, imageBuffer);
        
        // Manual entity setup
        entity.add(SomeImageComponent, { path: imagePath });
    }
}
```

**After:**
```typescript
@UploadField('image', IMAGE_UPLOAD_CONFIG)
async createPost(args: any): Promise<Entity> {
    // Upload handled automatically
    // Entity components added automatically
    // Security validation included
    // Storage abstraction handled
}
```

### Migration Steps

1. **Install Upload System:**
   ```typescript
   import { QuickSetup } from "bunsane/upload";
   await QuickSetup.forImages();
   ```

2. **Replace Manual File Handling:**
   - Replace manual `Bun.write()` calls with upload decorators
   - Replace custom validation with built-in validation
   - Replace manual path generation with automatic handling

3. **Update Entity Components:**
   - Replace custom file components with `UploadComponent`
   - Add `ImageMetadataComponent` for images
   - Update GraphQL field resolvers

4. **Update GraphQL Schema:**
   ```typescript
   // Add Upload scalar
   @GraphQLScalarType("Upload")
   
   // Update input types
   input: { image: "Upload!" as GraphQLType }
   ```

## Performance Considerations

### Batch Operations

For multiple files, use batch operations:

```typescript
const uploadManager = UploadManager.getInstance();
const results = await uploadManager.uploadFiles(files, config);
```

### Streaming for Large Files

```typescript
// For large files, consider streaming
const result = await uploadManager.uploadStream(fileStream, config);
```

### Caching and CDN

```typescript
// Configure CDN base URL
const config = {
    ...IMAGE_UPLOAD_CONFIG,
    cdnBaseUrl: 'https://cdn.example.com'
};
```

## Error Handling

### Upload Errors

```typescript
interface UploadError {
    code: string;
    message: string;
    details?: any;
}

// Common error codes:
// - FILE_TOO_LARGE
// - INVALID_FILE_TYPE
// - SECURITY_VIOLATION
// - STORAGE_ERROR
// - VALIDATION_FAILED
```

### Error Handling Patterns

```typescript
try {
    const result = await uploadManager.uploadFile(file, config);
    if (!result.success) {
        console.error('Upload failed:', result.error);
    }
} catch (error) {
    console.error('Upload system error:', error);
}
```

## Testing

### Unit Tests

```typescript
import { FileValidator, UploadManager } from "bunsane/upload";

describe('Upload System', () => {
    test('validates file types correctly', async () => {
        const validator = new FileValidator();
        const result = await validator.validate(mockImageFile, IMAGE_UPLOAD_CONFIG);
        expect(result.isValid).toBe(true);
    });
});
```

### Integration Tests

```typescript
test('full upload workflow', async () => {
    const uploadManager = UploadManager.getInstance();
    const result = await uploadManager.uploadFile(testFile, config);
    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
});
```

## Best Practices

1. **Always Use Configuration Objects** - Don't hardcode upload settings
2. **Enable Security Validation** - Always use `enableSecurity: true` in production
3. **Use Appropriate File Size Limits** - Balance user experience with storage costs
4. **Implement Proper Error Handling** - Handle all upload failure scenarios
5. **Use Entity Integration** - Leverage `UploadComponent` for metadata storage
6. **Consider Storage Strategy** - Choose appropriate storage backend for your scale
7. **Monitor Storage Usage** - Track and manage storage consumption
8. **Implement File Cleanup** - Remove orphaned files periodically

## Troubleshooting

### Common Issues

1. **File Not Uploading**
   - Check MIME type restrictions
   - Verify file size limits
   - Check storage directory permissions

2. **GraphQL Upload Errors**
   - Ensure Upload scalar is registered
   - Check decorator syntax
   - Verify input type definitions

3. **Security Validation Failures**
   - Check file signatures
   - Verify allowed extensions
   - Review security configuration

### Debug Mode

```typescript
// Enable detailed logging
const config = {
    ...IMAGE_UPLOAD_CONFIG,
    debug: true
};
```

## API Reference

### UploadManager Methods

- `uploadFile(file: File, config: UploadConfiguration): Promise<UploadResult>`
- `uploadFiles(files: File[], config: UploadConfiguration): Promise<UploadResult[]>`
- `deleteFile(path: string): Promise<boolean>`
- `registerStorageProvider(name: string, provider: StorageProvider): void`

### UploadHelper Methods

- `processUploadForEntity(file: File, entity: Entity, config: UploadConfiguration): Promise<UploadResult>`
- `getEntityStorageUsage(entity: Entity): Promise<number>`
- `getEntityUploadUrls(entity: Entity): Promise<string[]>`
- `generateSecureFilename(originalName: string, extension: string): string`
- `extractFileMetadata(file: File): Promise<FileMetadata>`

### FileValidator Methods

- `validate(file: File, config: UploadConfiguration): Promise<ValidationResult>`
- `validateFileSignature(file: File): Promise<boolean>`
- `isDangerous(file: File): Promise<boolean>`

This completes the comprehensive documentation for the Bunsane Upload System. The system is now production-ready with extensive documentation, examples, and best practices.