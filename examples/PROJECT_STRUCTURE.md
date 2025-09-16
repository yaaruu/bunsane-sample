# Bunsane Upload System - Project Structure

## Complete Implementation Structure

### Core Framework Files (bunsane/)

```
bunsane/
├── core/
│   ├── UploadManager.ts              # Central upload coordinator (200+ lines)
│   └── components/
│       ├── UploadComponent.ts        # Upload metadata component
│       └── ImageMetadataComponent.ts # Image-specific metadata
├── gql/
│   └── decorators/
│       └── Upload.ts                 # GraphQL upload decorators (400+ lines)
├── utils/
│   ├── UploadHelper.ts              # Upload utility functions (200+ lines)
│   └── ImageProcessor.ts            # Image processing utilities (300+ lines)
├── database/
│   ├── StorageProvider.ts           # Abstract storage interface
│   └── LocalStorageProvider.ts      # Local filesystem implementation (250+ lines)
├── validation/
│   └── FileValidator.ts             # Security validation system (300+ lines)
├── config/
│   └── upload.config.ts             # Upload configuration presets
├── upload/
│   ├── index.ts                     # Main upload module exports
│   └── upload.types.ts              # Comprehensive type definitions (200+ lines)
└── README.md                        # Framework documentation update
```

### Example Implementation Files (bunsane-example/)

```
bunsane-example/
└── examples/
    ├── PostServiceRefactored.ts              # Refactored service example (380+ lines)
    ├── ImageGalleryService.ts                # Advanced gallery system (600+ lines)
    ├── UPLOAD_SYSTEM_DOCUMENTATION.md       # Complete documentation (500+ lines)
    ├── MIGRATION_GUIDE.md                   # Migration guide (400+ lines)
    ├── IMPLEMENTATION_SUMMARY.md            # Implementation summary
    └── PROJECT_STRUCTURE.md                 # This file
```

## File Organization by Feature

### 1. Core Upload Infrastructure (Phase 1)
- **upload.types.ts** - Complete type system with 15+ interfaces
- **UploadManager.ts** - Singleton coordinator with batch processing
- **StorageProvider.ts** - Abstract storage interface
- **LocalStorageProvider.ts** - Filesystem storage with full CRUD operations
- **FileValidator.ts** - Security-first validation system
- **upload.config.ts** - Predefined configurations (IMAGE, DOCUMENT, BASIC)

### 2. Component Integration (Phase 2)
- **UploadComponent.ts** - Entity metadata storage with helper methods
- **ImageMetadataComponent.ts** - Image-specific metadata (dimensions, EXIF)
- **Upload.ts** - GraphQL decorators (@Upload, @UploadField, @UploadToEntity)
- **UploadHelper.ts** - Utility functions for common operations

### 3. Advanced Features (Phase 3)
- **ImageProcessor.ts** - Image manipulation (thumbnails, optimization, EXIF)
- **upload/index.ts** - Module organization and clean exports

### 4. Service Integration & Examples (Phase 4)
- **PostServiceRefactored.ts** - Complete service migration example
- **ImageGalleryService.ts** - Advanced features demonstration
- **Documentation** - Comprehensive guides and examples

## Architecture Mapping

### Import Structure
```typescript
// Main upload module
import { UploadManager, QuickSetup } from "bunsane/upload";

// Components
import { UploadComponent, ImageMetadataComponent } from "bunsane/upload";

// Decorators
import { Upload, UploadField, UploadToEntity } from "bunsane/upload";

// Utilities
import { UploadHelper, ImageProcessor } from "bunsane/upload";

// Configuration
import { IMAGE_UPLOAD_CONFIG, DOCUMENT_UPLOAD_CONFIG } from "bunsane/upload";

// Types
import type { UploadConfiguration, UploadResult, ValidationResult } from "bunsane/upload";
```

### Framework Integration Points

#### 1. Entity System Integration
```
Entity
├── UploadComponent (metadata storage)
├── ImageMetadataComponent (image data)
└── Custom business components
```

#### 2. GraphQL Integration
```
GraphQL Layer
├── Upload scalar type
├── @Upload decorators
├── Upload input types
└── File upload resolvers
```

#### 3. Storage Layer Integration
```
Storage Abstraction
├── LocalStorageProvider (filesystem)
├── S3StorageProvider (extensible)
├── AzureStorageProvider (extensible)
└── Custom providers
```

## Development Workflow

### 1. Basic Setup
```typescript
// Quick initialization
import { QuickSetup } from "bunsane/upload";
await QuickSetup.forImages();
```

### 2. Service Implementation
```typescript
// Add to service class
@GraphQLScalarType("Upload")
class MyService extends BaseService {
    @Upload()
    async uploadFile(args: { file: File }): Promise<string> {
        return "Success!";
    }
}
```

### 3. Entity Integration
```typescript
// Update ArcheType
const MyArcheType = new ArcheType([
    MyTag,
    UploadComponent,        // Add upload support
    ImageMetadataComponent  // Add for images
]);
```

## File Dependencies

### Core Dependencies
```
UploadManager
├── depends on: StorageProvider, FileValidator, upload.types
├── used by: UploadHelper, GraphQL decorators

FileValidator
├── depends on: upload.types
├── used by: UploadManager, UploadHelper

UploadComponent
├── depends on: Bunsane Entity system
├── used by: UploadHelper, Service examples
```

### GraphQL Dependencies
```
Upload.ts (decorators)
├── depends on: UploadManager, UploadHelper, upload.types
├── used by: Service implementations

GraphQL Services
├── depends on: Upload decorators, UploadComponent
├── provides: Upload mutations and queries
```

## Testing Structure

### Unit Tests (Recommended)
```
tests/
├── upload/
│   ├── UploadManager.test.ts
│   ├── FileValidator.test.ts
│   ├── LocalStorageProvider.test.ts
│   └── UploadHelper.test.ts
├── integration/
│   ├── graphql-upload.test.ts
│   └── end-to-end.test.ts
└── examples/
    ├── PostService.test.ts
    └── ImageGallery.test.ts
```

### Test Data Structure
```
test-data/
├── images/
│   ├── valid-image.jpg
│   ├── invalid-file.txt
│   └── large-image.png
└── documents/
    ├── valid-doc.pdf
    └── malicious-file.exe
```

## Configuration Management

### Environment-Specific Configs
```typescript
// Development
const devConfig = {
    ...IMAGE_UPLOAD_CONFIG,
    uploadDir: './dev-uploads',
    enableDebug: true
};

// Production
const prodConfig = {
    ...IMAGE_UPLOAD_CONFIG,
    uploadDir: '/app/uploads',
    storageProvider: 's3',
    enableSecurity: true
};
```

### Security Configuration
```typescript
const secureConfig = {
    maxFileSize: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    enableSecurity: true,
    scanForMalware: true,
    generateUniqueNames: true
};
```

## Deployment Structure

### Production Layout
```
production/
├── app/
│   ├── uploads/           # Local storage directory
│   ├── thumbnails/        # Generated thumbnails
│   └── temp/             # Temporary upload processing
├── config/
│   ├── upload.prod.json  # Production upload config
│   └── storage.json      # Storage provider config
└── logs/
    └── upload.log        # Upload operation logs
```

### CDN Integration
```
CDN Structure
├── static/uploads/       # Public upload files
├── thumbnails/          # Optimized thumbnails
└── processed/           # Processed/optimized files
```

## Monitoring & Observability

### Logging Structure
```typescript
// Upload operation logs
{
    timestamp: "2024-01-01T00:00:00Z",
    operation: "upload",
    fileId: "upload-12345",
    fileName: "image.jpg",
    size: 1024000,
    duration: 150,
    success: true
}
```

### Metrics to Track
- Upload success/failure rates
- File processing times
- Storage usage trends
- Security validation results
- Error frequency by type

## Future Extensibility

### Plugin Architecture
```
plugins/
├── storage/
│   ├── S3Provider.ts
│   ├── AzureProvider.ts
│   └── GoogleCloudProvider.ts
├── processors/
│   ├── VideoProcessor.ts
│   ├── DocumentProcessor.ts
│   └── AudioProcessor.ts
└── validators/
    ├── AntivirusValidator.ts
    └── ContentValidator.ts
```

### Extension Points
1. **Custom Storage Providers** - Implement StorageProvider interface
2. **Custom Validators** - Extend FileValidator
3. **Custom Processors** - Add file type processors
4. **Custom Decorators** - Create specialized upload decorators

## Documentation Hierarchy

1. **IMPLEMENTATION_SUMMARY.md** - Executive overview and status
2. **UPLOAD_SYSTEM_DOCUMENTATION.md** - Complete user guide
3. **MIGRATION_GUIDE.md** - Migration from legacy systems
4. **PROJECT_STRUCTURE.md** - This file - project organization
5. **Individual file headers** - Inline documentation for each component

This structure provides a comprehensive, scalable, and maintainable upload system that integrates seamlessly with the Bunsane framework while following modern software architecture principles.