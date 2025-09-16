# Migration Guide: Adopting the Bunsane Upload System

## Overview

This guide helps you migrate existing Bunsane applications to use the new Upload System. The migration process is designed to be incremental, allowing you to adopt the system gradually without breaking existing functionality.

## Pre-Migration Assessment

### 1. Identify Current Upload Patterns

**Check for these patterns in your codebase:**

```typescript
// Pattern 1: Manual Bun.write() usage
await Bun.write(filePath, arrayBuffer);

// Pattern 2: Custom file handling in GraphQL mutations
const imageBuffer = await args.image.arrayBuffer();

// Pattern 3: Custom file validation
if (!args.file.type.startsWith('image/')) {
    throw new Error('Invalid file type');
}

// Pattern 4: Manual path generation
const fileName = `${Date.now()}-${originalName}`;

// Pattern 5: Custom file components
class CustomImageComponent extends BaseComponent {
    @CompData() imagePath: string = "";
    @CompData() imageUrl: string = "";
}
```

### 2. Audit Current File Storage

```bash
# Find all upload directories
find . -type d -name "*upload*" -o -name "*files*" -o -name "*media*"

# Check for hardcoded file paths
grep -r "\.\/uploads" src/
grep -r "\.\/files" src/
grep -r "\.\/media" src/
```

### 3. Review GraphQL Schema

```graphql
# Look for custom file types
type MyFile {
    path: String!
    url: String!
    name: String!
}

# Look for file input patterns
input CreatePostInput {
    title: String!
    image: String!  # Should become Upload!
}
```

## Migration Strategy

### Phase 1: Setup and Preparation

#### 1.1 Install Upload System

```typescript
// In your main application startup
import { QuickSetup } from "bunsane/upload";

// Add to your app initialization
async function initializeApp() {
    // Existing initialization...
    
    // Add upload system
    await QuickSetup.basic();
    // or for image-focused apps:
    await QuickSetup.forImages();
}
```

#### 1.2 Update Package Dependencies

```json
{
  "dependencies": {
    "bunsane": "latest",
    // Ensure you have the latest version with upload system
  }
}
```

#### 1.3 Create Upload Configuration

```typescript
// config/upload.config.ts
import { UploadConfiguration, IMAGE_UPLOAD_CONFIG } from "bunsane/upload";

export const APP_UPLOAD_CONFIG: UploadConfiguration = {
    ...IMAGE_UPLOAD_CONFIG,
    uploadDir: './uploads', // Match your existing upload directory
    maxFileSize: 10 * 1024 * 1024, // 10MB - adjust to your needs
    preserveOriginalName: true, // Keep compatibility with existing files
};

export const LEGACY_UPLOAD_DIR = './uploads'; // Your existing upload directory
```

### Phase 2: GraphQL Schema Migration

#### 2.1 Add Upload Scalar

**Before:**
```typescript
@GraphQLScalarType("Date")
class MyService extends BaseService {
    // ...
}
```

**After:**
```typescript
@GraphQLScalarType("Date")
@GraphQLScalarType("Upload")  // Add this line
class MyService extends BaseService {
    // ...
}
```

#### 2.2 Update Input Types

**Before:**
```typescript
const CreatePostInputs = {
    createPost: {
        title: GraphQLFieldTypes.STRING_REQUIRED,
        content: GraphQLFieldTypes.STRING_REQUIRED,
        image: GraphQLFieldTypes.STRING_OPTIONAL, // File path as string
    }
} as const;
```

**After:**
```typescript
const CreatePostInputs = {
    createPost: {
        title: GraphQLFieldTypes.STRING_REQUIRED,
        content: GraphQLFieldTypes.STRING_REQUIRED,
        image: "Upload" as GraphQLType, // Now proper Upload type
    }
} as const;
```

### Phase 3: Component Migration

#### 3.1 Migrate Custom File Components

**Before:**
```typescript
@Component
class PostImageComponent extends BaseComponent {
    @CompData() imagePath: string = "";
    @CompData() imageUrl: string = "";
    @CompData() fileName: string = "";
    @CompData() fileSize: number = 0;
}
```

**After:**
```typescript
// Replace with standard components
import { UploadComponent, ImageMetadataComponent } from "bunsane/upload";

// Update your ArcheType
const PostArcheType = new ArcheType([
    PostTag,
    TitleComponent,
    ContentComponent,
    DateComponent,
    AuthorComponent,
    UploadComponent,        // Replaces PostImageComponent
    ImageMetadataComponent  // For image-specific metadata
]);
```

#### 3.2 Data Migration Script

```typescript
// scripts/migrate-file-data.ts
import { Entity, Query } from "bunsane";
import { UploadComponent } from "bunsane/upload";

async function migrateFileData() {
    console.log("Starting file data migration...");
    
    // Find all entities with old file components
    const entities = await new Query()
        .with(PostImageComponent) // Your old component
        .exec();
    
    for (const entity of entities) {
        const oldImageData = await entity.get(PostImageComponent);
        if (oldImageData) {
            // Migrate to new component structure
            entity.add(UploadComponent, {
                uploadId: `legacy-${entity.id}`,
                fileName: extractFileName(oldImageData.imagePath),
                originalFileName: oldImageData.fileName,
                mimeType: guessMimeType(oldImageData.imagePath),
                size: oldImageData.fileSize || 0,
                path: oldImageData.imagePath,
                url: oldImageData.imageUrl,
                uploadedAt: new Date().toISOString(),
                metadata: JSON.stringify({ migrated: true })
            });
            
            // Remove old component (optional - can keep for backwards compatibility)
            // entity.remove(PostImageComponent);
            
            await entity.save();
        }
    }
    
    console.log(`Migrated ${entities.length} entities`);
}

function extractFileName(path: string): string {
    return path.split('/').pop() || 'unknown';
}

function guessMimeType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
    };
    return mimeMap[ext || ''] || 'application/octet-stream';
}

// Run migration
migrateFileData().catch(console.error);
```

### Phase 4: Service Method Migration

#### 4.1 Simple Upload Mutation

**Before:**
```typescript
@GraphQLOperation({
    type: "Mutation",
    input: CreatePostInputs.createPost,
    output: "Post"
})
async createPost(args: ResolverInput<typeof CreatePostInputs.createPost>): Promise<Entity> {
    // Manual file handling
    let imagePath = "";
    let imageUrl = "";
    
    if (args.image) {
        const imageFile = args.image as any; // Type assertion needed
        const imageBuffer = await imageFile.arrayBuffer();
        const fileName = `${Date.now()}-${imageFile.name}`;
        imagePath = `./uploads/${fileName}`;
        imageUrl = `/uploads/${fileName}`;
        
        // Manual validation
        if (!imageFile.type.startsWith('image/')) {
            throw new Error('Invalid file type');
        }
        
        if (imageFile.size > 5 * 1024 * 1024) {
            throw new Error('File too large');
        }
        
        await Bun.write(imagePath, imageBuffer);
    }
    
    const post = PostArcheType.fill({
        title: args.title,
        content: args.content,
        authorId: context.userId,
        date: new Date().toISOString()
    }).createEntity();
    
    if (imagePath) {
        post.add(PostImageComponent, {
            imagePath,
            imageUrl,
            fileName: (args.image as any).name,
            fileSize: (args.image as any).size
        });
    }
    
    await post.save();
    return post;
}
```

**After:**
```typescript
@GraphQLOperation({
    type: "Mutation",
    input: CreatePostInputs.createPost,
    output: "Post"
})
@UploadField('image', APP_UPLOAD_CONFIG) // Add this decorator
async createPost(args: ResolverInput<typeof CreatePostInputs.createPost>): Promise<Entity> {
    // Upload handled automatically by decorator
    
    const post = PostArcheType.fill({
        title: args.title,
        content: args.content,
        authorId: context.userId,
        date: new Date().toISOString()
    }).createEntity();
    
    // File is automatically processed and UploadComponent is added
    // No manual file handling needed!
    
    await post.save();
    return post;
}
```

#### 4.2 Batch Upload Migration

**Before:**
```typescript
async uploadMultiple(args: { files: any[] }): Promise<string[]> {
    const results: string[] = [];
    
    for (const file of args.files) {
        try {
            const buffer = await file.arrayBuffer();
            const fileName = `${Date.now()}-${file.name}`;
            const path = `./uploads/${fileName}`;
            await Bun.write(path, buffer);
            results.push(`/uploads/${fileName}`);
        } catch (error) {
            console.error('Upload failed:', error);
        }
    }
    
    return results;
}
```

**After:**
```typescript
async uploadMultiple(args: { files: File[] }): Promise<any> {
    const uploadManager = UploadManager.getInstance();
    const results = await uploadManager.uploadFiles(args.files, APP_UPLOAD_CONFIG);
    
    return {
        totalFiles: results.length,
        successfulUploads: results.filter(r => r.success).length,
        failedUploads: results.filter(r => !r.success).length,
        urls: results.filter(r => r.success).map(r => r.url)
    };
}
```

### Phase 5: GraphQL Resolver Migration

#### 5.1 Field Resolver Updates

**Before:**
```typescript
@GraphQLField({type: "Post", field: "imageUrl"})
async postImageUrlResolver(parent: Entity): Promise<string | null> {
    const imageData = await parent.get(PostImageComponent);
    return imageData?.imageUrl || null;
}

@GraphQLField({type: "Post", field: "fileName"})
async postFileNameResolver(parent: Entity): Promise<string | null> {
    const imageData = await parent.get(PostImageComponent);
    return imageData?.fileName || null;
}
```

**After:**
```typescript
@GraphQLField({type: "Post", field: "imageUrl"})
async postImageUrlResolver(parent: Entity): Promise<string | null> {
    const uploadData = await parent.get(UploadComponent);
    return uploadData?.url || null;
}

@GraphQLField({type: "Post", field: "fileName"})
async postFileNameResolver(parent: Entity): Promise<string | null> {
    const uploadData = await parent.get(UploadComponent);
    return uploadData?.originalFileName || null;
}

// New resolvers available
@GraphQLField({type: "Post", field: "fileSize"})
async postFileSizeResolver(parent: Entity): Promise<number> {
    const uploadData = await parent.get(UploadComponent);
    return uploadData?.size || 0;
}

@GraphQLField({type: "Post", field: "uploadedAt"})
async postUploadedAtResolver(parent: Entity): Promise<string | null> {
    const uploadData = await parent.get(UploadComponent);
    return uploadData?.uploadedAt || null;
}
```

### Phase 6: Testing Migration

#### 6.1 Create Migration Tests

```typescript
// tests/migration.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Entity } from "bunsane";
import { UploadComponent } from "bunsane/upload";

describe('Upload System Migration', () => {
    beforeAll(async () => {
        // Setup test environment
        await QuickSetup.basic();
    });
    
    test('migrated entities have upload components', async () => {
        const post = await Entity.FindById('test-post-id');
        const uploadData = await post?.get(UploadComponent);
        
        expect(uploadData).toBeDefined();
        expect(uploadData?.url).toBeDefined();
        expect(uploadData?.fileName).toBeDefined();
    });
    
    test('file upload works with new system', async () => {
        const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
        
        // Test upload
        const uploadManager = UploadManager.getInstance();
        const result = await uploadManager.uploadFile(mockFile, APP_UPLOAD_CONFIG);
        
        expect(result.success).toBe(true);
        expect(result.url).toBeDefined();
    });
    
    afterAll(async () => {
        // Cleanup test files
    });
});
```

#### 6.2 Integration Tests

```typescript
// tests/integration.test.ts
describe('End-to-end Upload Integration', () => {
    test('GraphQL upload mutation works', async () => {
        const mutation = `
            mutation CreatePost($title: String!, $image: Upload!) {
                createPost(title: $title, image: $image) {
                    id
                    title
                    imageUrl
                    fileName
                }
            }
        `;
        
        const variables = {
            title: "Test Post",
            image: new File(['test'], 'test.jpg', { type: 'image/jpeg' })
        };
        
        const result = await graphqlRequest(mutation, variables);
        
        expect(result.data.createPost.imageUrl).toBeDefined();
        expect(result.data.createPost.fileName).toBe('test.jpg');
    });
});
```

## Rollback Strategy

### 1. Component Rollback

If you need to rollback, keep your old components alongside new ones:

```typescript
const PostArcheType = new ArcheType([
    PostTag,
    TitleComponent,
    ContentComponent,
    DateComponent,
    AuthorComponent,
    PostImageComponent,     // Keep old component
    UploadComponent,        // Add new component
    ImageMetadataComponent
]);
```

### 2. Service Method Rollback

Create feature flags to switch between old and new implementations:

```typescript
const USE_NEW_UPLOAD_SYSTEM = process.env.USE_NEW_UPLOAD_SYSTEM === 'true';

@GraphQLOperation({
    type: "Mutation",
    input: CreatePostInputs.createPost,
    output: "Post"
})
async createPost(args: any): Promise<Entity> {
    if (USE_NEW_UPLOAD_SYSTEM) {
        return this.createPostWithUploadSystem(args);
    } else {
        return this.createPostLegacy(args);
    }
}
```

## Migration Checklist

### Pre-Migration
- [ ] Backup existing upload directories
- [ ] Document current upload patterns
- [ ] Create migration test plan
- [ ] Set up staging environment

### Phase 1: Setup
- [ ] Install latest Bunsane version
- [ ] Add upload system initialization
- [ ] Create upload configuration
- [ ] Add Upload scalar to GraphQL

### Phase 2: Components
- [ ] Create new ArcheTypes with UploadComponent
- [ ] Run data migration script
- [ ] Test component data access
- [ ] Verify file paths still work

### Phase 3: Services
- [ ] Migrate simple upload mutations
- [ ] Update GraphQL input types
- [ ] Add upload decorators
- [ ] Test upload functionality

### Phase 4: Resolvers
- [ ] Update field resolvers
- [ ] Add new upload-related fields
- [ ] Test GraphQL responses
- [ ] Verify backward compatibility

### Phase 5: Testing
- [ ] Run migration tests
- [ ] Perform integration testing
- [ ] Load test upload functionality
- [ ] Verify production readiness

### Post-Migration
- [ ] Monitor upload performance
- [ ] Clean up old code (optional)
- [ ] Update documentation
- [ ] Train team on new system

## Common Pitfalls and Solutions

### 1. File Path Conflicts

**Problem:** Old and new upload paths conflict

**Solution:**
```typescript
// Use path mapping for compatibility
const getFileUrl = (uploadData: any) => {
    if (uploadData.url.startsWith('/uploads/')) {
        return uploadData.url; // Already has correct path
    }
    return `/uploads/${uploadData.fileName}`; // Add prefix for legacy files
};
```

### 2. MIME Type Issues

**Problem:** Legacy files don't have proper MIME types

**Solution:**
```typescript
// Add MIME type detection in migration
import { lookup } from 'mime-types';

const guessMimeType = (fileName: string): string => {
    return lookup(fileName) || 'application/octet-stream';
};
```

### 3. Component Data Format

**Problem:** Component data structure changed

**Solution:**
```typescript
// Create adapter functions
const getUploadInfo = async (entity: Entity) => {
    // Try new component first
    let uploadData = await entity.get(UploadComponent);
    if (uploadData) return uploadData;
    
    // Fallback to old component
    const oldData = await entity.get(PostImageComponent);
    if (oldData) {
        return {
            url: oldData.imageUrl,
            fileName: oldData.fileName,
            size: oldData.fileSize
        };
    }
    
    return null;
};
```

## Performance Considerations

### 1. Migration Performance

- Migrate data in batches to avoid memory issues
- Use transactions for data consistency
- Consider running migration during low-traffic periods

### 2. Storage Performance

- The new system includes automatic optimization
- Consider migrating files to optimized storage gradually
- Monitor storage usage and cleanup orphaned files

## Post-Migration Benefits

After successful migration, you'll gain:

1. **Improved Security** - Built-in validation and security checks
2. **Better Performance** - Optimized file handling and storage
3. **Standardization** - Consistent upload patterns across your app
4. **Extensibility** - Easy to add new storage backends
5. **Maintainability** - Less custom code to maintain
6. **Features** - Built-in image processing, metadata extraction, etc.

## Support and Troubleshooting

### Common Issues

1. **Upload scalar not found**
   - Ensure `@GraphQLScalarType("Upload")` is added to your service
   - Check that GraphQL Yoga is properly configured

2. **File validation errors**
   - Review your upload configuration
   - Check file MIME types and extensions
   - Verify file size limits

3. **Component data access errors**
   - Use `await entity.get(UploadComponent)` pattern
   - Check that entities have the upload component
   - Verify component data structure

### Getting Help

- Check the comprehensive documentation in `UPLOAD_SYSTEM_DOCUMENTATION.md`
- Review example implementations in `PostServiceRefactored.ts` and `ImageGalleryService.ts`
- Test with the provided migration scripts
- Monitor logs for detailed error information

This migration guide provides a systematic approach to adopting the Bunsane Upload System while maintaining backward compatibility and minimizing disruption to your existing application.