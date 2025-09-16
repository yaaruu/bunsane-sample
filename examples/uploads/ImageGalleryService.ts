/**
 * ImageGalleryService - Advanced Upload System Example
 * Demonstrates batch uploads, image processing, and metadata management
 */

import {
    BaseService,
} from "bunsane/service";
import { 
    GraphQLField, 
    GraphQLOperation, 
    GraphQLObjectType, 
    GraphQLFieldTypes,
    type ResolverInput,
    type GraphQLType,
    GraphQLScalarType,
    isFieldRequested
} from "bunsane/gql";
import { 
    Entity, 
    BaseComponent, 
    CompData, 
    Component, 
    ArcheType, 
    Query, 
    responseError, 
    handleGraphQLError,
    BatchLoader
} from "bunsane";
import { timed } from "bunsane/core/Decorators";

// Import upload system
import { 
    UploadHelper, 
    UploadComponent, 
    ImageMetadataComponent,
    UploadManager,
    QuickSetup,
    IMAGE_UPLOAD_CONFIG,
    type BatchUploadResult 
} from "bunsane/upload";

const GalleryInputs = {
    galleries: {
        id: GraphQLFieldTypes.ID_OPTIONAL,
        userId: GraphQLFieldTypes.ID_OPTIONAL,
        limit: GraphQLFieldTypes.INT_OPTIONAL,
        offset: GraphQLFieldTypes.INT_OPTIONAL
    } as const,
    createGallery: {
        title: GraphQLFieldTypes.STRING_REQUIRED,
        description: GraphQLFieldTypes.STRING_OPTIONAL,
        userId: GraphQLFieldTypes.ID_REQUIRED,
        images: "[Upload]!" as GraphQLType
    } as const,
    addImages: {
        galleryId: GraphQLFieldTypes.ID_REQUIRED,
        images: "[Upload]!" as GraphQLType
    } as const
} as const;

@Component
class GalleryTag extends BaseComponent {}

@Component
class GalleryTitleComponent extends BaseComponent {
    @CompData()
    value: string = "";
}

@Component
class GalleryDescriptionComponent extends BaseComponent {
    @CompData()
    value: string = "";
}

@Component
class GalleryOwnerComponent extends BaseComponent {
    @CompData()
    value: string = "";
}

@Component
class GalleryImageComponent extends BaseComponent {
    @CompData()
    imageIds: string = "[]"; // JSON array of image entity IDs

    getImageIds(): string[] {
        try {
            return JSON.parse(this.imageIds);
        } catch {
            return [];
        }
    }

    addImageId(imageId: string): void {
        const imageIds = this.getImageIds();
        if (!imageIds.includes(imageId)) {
            imageIds.push(imageId);
            this.imageIds = JSON.stringify(imageIds);
        }
    }

    removeImageId(imageId: string): void {
        const imageIds = this.getImageIds();
        const filtered = imageIds.filter(id => id !== imageId);
        this.imageIds = JSON.stringify(filtered);
    }
}

const GalleryArcheType = new ArcheType([
    GalleryTag,
    GalleryTitleComponent,
    GalleryDescriptionComponent,
    GalleryOwnerComponent,
    GalleryImageComponent
]);

const ImageArcheType = new ArcheType([
    UploadComponent,
    ImageMetadataComponent
]);

const galleryFields = {
    id: GraphQLFieldTypes.ID_REQUIRED,
    title: GraphQLFieldTypes.STRING_REQUIRED,
    description: GraphQLFieldTypes.STRING_OPTIONAL,
    owner: "User!" as GraphQLType,
    images: "[GalleryImage]!" as GraphQLType,
    imageCount: GraphQLFieldTypes.INT_REQUIRED,
    totalSize: GraphQLFieldTypes.INT_REQUIRED,
    createdAt: "Date" as GraphQLType
};

const galleryImageFields = {
    id: GraphQLFieldTypes.ID_REQUIRED,
    url: GraphQLFieldTypes.STRING_REQUIRED,
    thumbnailUrl: GraphQLFieldTypes.STRING_OPTIONAL,
    fileName: GraphQLFieldTypes.STRING_REQUIRED,
    originalFileName: GraphQLFieldTypes.STRING_REQUIRED,
    mimeType: GraphQLFieldTypes.STRING_REQUIRED,
    size: GraphQLFieldTypes.INT_REQUIRED,
    width: GraphQLFieldTypes.INT_OPTIONAL,
    height: GraphQLFieldTypes.INT_OPTIONAL,
    uploadedAt: "Date" as GraphQLType
};

@GraphQLObjectType({
    name: "Gallery",
    fields: galleryFields
})
@GraphQLObjectType({
    name: "GalleryImage",
    fields: galleryImageFields
})
@GraphQLObjectType({
    name: "BatchUploadResult",
    fields: {
        totalFiles: GraphQLFieldTypes.INT_REQUIRED,
        successfulUploads: GraphQLFieldTypes.INT_REQUIRED,
        failedUploads: GraphQLFieldTypes.INT_REQUIRED,
        errors: "[String]" as GraphQLType
    }
})
@GraphQLScalarType("Date")
@GraphQLScalarType("Upload")
class ImageGalleryService extends BaseService {

    constructor() {
        super();
        // Initialize upload system for images
        this.initializeUploadSystem();
    }

    private async initializeUploadSystem(): Promise<void> {
        await QuickSetup.forImages();
    }

    // #region Gallery Queries
    
    @GraphQLOperation({
        type: "Query",
        input: GalleryInputs.galleries,
        output: "[Gallery]"
    })
    @timed("ImageGalleryService.galleries")
    async galleries(args: ResolverInput<typeof GalleryInputs.galleries>, context: any, info: any): Promise<Entity[]> {
        const query = new Query().with(GalleryTag);
        
        const componentsToLoad: (new () => BaseComponent)[] = [
            GalleryTitleComponent,
            GalleryDescriptionComponent,
            GalleryOwnerComponent,
            GalleryImageComponent
        ];
        
        query.eagerLoadComponents(componentsToLoad);
        
        if (args.id) {
            query.findById(args.id);
        }
        
        if (args.userId) {
            query.with(GalleryOwnerComponent, 
                Query.filters(
                    Query.filter("value", Query.filterOp.EQ, args.userId)
                )
            );
        }
        
        if (args.limit) {
            query.take(args.limit);
        }
        
        if (args.offset) {
            query.offset(args.offset);
        }
        
        const entities = await query.exec();
        
        // Preload images for galleries
        if (isFieldRequested(info, 'images')) {
            await this.preloadImagesForGalleries(entities, context);
        }
        
        return entities;
    }

    // #endregion

    // #region Gallery Mutations
    
    @GraphQLOperation({
        type: "Mutation",
        input: GalleryInputs.createGallery,
        output: "Gallery"
    })
    async createGallery(
        args: ResolverInput<typeof GalleryInputs.createGallery>, 
        context: any
    ): Promise<Entity> {
        try {
            // Validate user exists
            const user = await Entity.FindById(args.userId);
            if (!user) {
                throw responseError("User not found", {
                    extensions: { code: "USER_NOT_FOUND" }
                });
            }

            // Create gallery entity
            const gallery = GalleryArcheType.fill({
                title: args.title,
                description: args.description || "",
                userId: args.userId
            }).createEntity();

            // Process batch image upload
            const uploadResult = await this.processBatchImageUpload(
                args.images as File[],
                gallery
            );

            if (uploadResult.failedUploads > 0) {
                console.warn(`${uploadResult.failedUploads} images failed to upload`);
            }

            await gallery.save();
            return gallery;
            
        } catch (err) {
            handleGraphQLError(err);
        }
    }

    @GraphQLOperation({
        type: "Mutation",
        input: GalleryInputs.addImages,
        output: "BatchUploadResult"
    })
    async addImagesToGallery(
        args: ResolverInput<typeof GalleryInputs.addImages>,
        context: any
    ): Promise<any> {
        try {
            const gallery = await Entity.FindById(args.galleryId);
            if (!gallery) {
                throw responseError("Gallery not found", {
                    extensions: { code: "GALLERY_NOT_FOUND" }
                });
            }

            const uploadResult = await this.processBatchImageUpload(
                args.images as File[],
                gallery
            );

            await gallery.save();

            return {
                totalFiles: uploadResult.totalFiles,
                successfulUploads: uploadResult.successfulUploads,
                failedUploads: uploadResult.failedUploads,
                errors: uploadResult.errors.map(e => e.message)
            };
            
        } catch (err) {
            handleGraphQLError(err);
        }
    }

    @GraphQLOperation({
        type: "Mutation",
        input: {
            galleryId: GraphQLFieldTypes.ID_REQUIRED,
            imageId: GraphQLFieldTypes.ID_REQUIRED
        },
        output: "Boolean"
    })
    async removeImageFromGallery(
        args: { galleryId: string; imageId: string },
        context: any
    ): Promise<boolean> {
        try {
            const gallery = await Entity.FindById(args.galleryId);
            if (!gallery) {
                throw responseError("Gallery not found", {
                    extensions: { code: "GALLERY_NOT_FOUND" }
                });
            }

            const galleryImages = await gallery.get(GalleryImageComponent);
            if (galleryImages) {
                const currentImageIds = galleryImages.imageIds ? JSON.parse(galleryImages.imageIds) : [];
                const filteredImageIds = currentImageIds.filter((id: string) => id !== args.imageId);
                
                gallery.set(GalleryImageComponent, {
                    imageIds: JSON.stringify(filteredImageIds)
                });
            }

            // Delete the image entity and its files
            const imageEntity = await Entity.FindById(args.imageId);
            if (imageEntity) {
                const uploadData = await imageEntity.get(UploadComponent);
                if (uploadData) {
                    // Delete physical file
                    const uploadManager = UploadManager.getInstance();
                    await uploadManager.deleteFile(uploadData.path);
                }
                
                // Delete entity (this would require entity deletion method)
                // await imageEntity.delete();
            }

            await gallery.save();
            return true;
            
        } catch (err) {
            handleGraphQLError(err);
            return false;
        }
    }

    // #endregion

    // #region Field Resolvers

    @GraphQLField({type: "Gallery", field: "id"})
    async galleryIdResolver(parent: Entity): Promise<string> {
        return parent.id;
    }

    @GraphQLField({type: "Gallery", field: "title"})
    async galleryTitleResolver(parent: Entity): Promise<string> {
        const data = await parent.get(GalleryTitleComponent);
        return data?.value || "";
    }

    @GraphQLField({type: "Gallery", field: "description"})
    async galleryDescriptionResolver(parent: Entity): Promise<string | null> {
        const data = await parent.get(GalleryDescriptionComponent);
        return data?.value || null;
    }

    @GraphQLField({type: "Gallery", field: "owner"})
    async galleryOwnerResolver(parent: Entity): Promise<Entity | null> {
        const data = await parent.get(GalleryOwnerComponent);
        const ownerId = data?.value;
        if (!ownerId) return null;
        
        return await Entity.FindById(ownerId);
    }

    @GraphQLField({type: "Gallery", field: "images"})
    async galleryImagesResolver(parent: Entity, args: any, context: any): Promise<Entity[]> {
        const galleryImages = await parent.get(GalleryImageComponent);
        if (!galleryImages) return [];

        const imageIds = galleryImages.imageIds ? JSON.parse(galleryImages.imageIds) : [];
        const images: Entity[] = [];

        for (const imageId of imageIds) {
            const imageEntity = await Entity.FindById(imageId);
            if (imageEntity) {
                images.push(imageEntity);
            }
        }

        return images;
    }

    @GraphQLField({type: "Gallery", field: "imageCount"})
    async galleryImageCountResolver(parent: Entity): Promise<number> {
        const galleryImages = await parent.get(GalleryImageComponent);
        if (!galleryImages) return 0;
        
        const imageIds = galleryImages.imageIds ? JSON.parse(galleryImages.imageIds) : [];
        return imageIds.length;
    }

    @GraphQLField({type: "Gallery", field: "totalSize"})
    async galleryTotalSizeResolver(parent: Entity): Promise<number> {
        const galleryImages = await parent.get(GalleryImageComponent);
        if (!galleryImages) return 0;

        const imageIds = galleryImages.imageIds ? JSON.parse(galleryImages.imageIds) : [];
        let totalSize = 0;

        for (const imageId of imageIds) {
            const imageEntity = await Entity.FindById(imageId);
            if (imageEntity) {
                const size = await UploadHelper.getEntityStorageUsage(imageEntity);
                totalSize += size;
            }
        }

        return totalSize;
    }

    // Image field resolvers
    @GraphQLField({type: "GalleryImage", field: "url"})
    async imageUrlResolver(parent: Entity): Promise<string> {
        const uploadData = await parent.get(UploadComponent);
        return uploadData?.url || "";
    }

    @GraphQLField({type: "GalleryImage", field: "fileName"})
    async imageFileNameResolver(parent: Entity): Promise<string> {
        const uploadData = await parent.get(UploadComponent);
        return uploadData?.fileName || "";
    }

    @GraphQLField({type: "GalleryImage", field: "originalFileName"})
    async imageOriginalFileNameResolver(parent: Entity): Promise<string> {
        const uploadData = await parent.get(UploadComponent);
        return uploadData?.originalFileName || "";
    }

    @GraphQLField({type: "GalleryImage", field: "size"})
    async imageSizeResolver(parent: Entity): Promise<number> {
        const uploadData = await parent.get(UploadComponent);
        return uploadData?.size || 0;
    }

    @GraphQLField({type: "GalleryImage", field: "width"})
    async imageWidthResolver(parent: Entity): Promise<number | null> {
        const imageMetadata = await parent.get(ImageMetadataComponent);
        return imageMetadata?.width || null;
    }

    @GraphQLField({type: "GalleryImage", field: "height"})
    async imageHeightResolver(parent: Entity): Promise<number | null> {
        const imageMetadata = await parent.get(ImageMetadataComponent);
        return imageMetadata?.height || null;
    }

    // #endregion

    // #region Private Helper Methods

    private async processBatchImageUpload(
        files: File[],
        gallery: Entity
    ): Promise<BatchUploadResult> {
        const uploadManager = UploadManager.getInstance();
        const results = await uploadManager.uploadFiles(files, IMAGE_UPLOAD_CONFIG);

        let successfulUploads = 0;
        let failedUploads = 0;
        const errors: any[] = [];
        const galleryImages = await gallery.get(GalleryImageComponent);
        const currentImageIds = galleryImages?.imageIds ? JSON.parse(galleryImages.imageIds) : [];

        for (const result of results) {
            if (result.success && result.uploadId) {
                successfulUploads++;

                // Create image entity
                const imageEntity = ImageArcheType.createEntity();
                
                // Add upload component
                imageEntity.add(UploadComponent, {
                    uploadId: result.uploadId,
                    fileName: result.fileName!,
                    originalFileName: result.originalFileName!,
                    mimeType: result.mimeType!,
                    size: result.size!,
                    path: result.path!,
                    url: result.url!,
                    uploadedAt: new Date().toISOString(),
                    metadata: JSON.stringify(result.metadata || {})
                });

                // Add basic image metadata (would be enhanced with actual image processing)
                imageEntity.add(ImageMetadataComponent, {
                    width: 0, // Would be extracted from image
                    height: 0, // Would be extracted from image
                    colorDepth: 24,
                    hasAlpha: result.mimeType === 'image/png',
                    isAnimated: result.mimeType === 'image/gif',
                    thumbnails: "[]"
                });

                await imageEntity.save();
                
                // Add to gallery
                currentImageIds.push(imageEntity.id);

            } else {
                failedUploads++;
                if (result.error) {
                    errors.push(result.error);
                }
            }
        }

        // Update gallery with new image list
        gallery.set(GalleryImageComponent, {
            imageIds: JSON.stringify(currentImageIds)
        });

        return {
            totalFiles: files.length,
            successfulUploads,
            failedUploads,
            results,
            errors
        };
    }

    private async preloadImagesForGalleries(galleries: Entity[], context: any): Promise<void> {
        // This would implement efficient batch loading of images
        // For now, it's a placeholder
        context.galleryImages = new Map();
    }

    // #endregion
}

export default ImageGalleryService;
export { GalleryTag, GalleryTitleComponent, GalleryDescriptionComponent, GalleryOwnerComponent };