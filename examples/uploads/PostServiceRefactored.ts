/**
 * PostService Refactored - Using Bunsane Upload System
 * This example shows how to refactor the original PostService to use the new upload system
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

// Import the new upload system
import { 
    UploadHelper, 
    UploadComponent, 
    ImageMetadataComponent,
    UploadDecorators,
    IMAGE_UPLOAD_CONFIG 
} from "bunsane/upload";

const PostInputs = {
    posts: {
        id: GraphQLFieldTypes.ID_OPTIONAL,
        limit: GraphQLFieldTypes.INT_OPTIONAL,
        offset: GraphQLFieldTypes.INT_OPTIONAL
    } as const,
    createPost: {
        title: GraphQLFieldTypes.STRING_REQUIRED,
        content: GraphQLFieldTypes.STRING_REQUIRED,
        author: GraphQLFieldTypes.ID_REQUIRED,
        date: GraphQLFieldTypes.STRING_OPTIONAL,
        image: "Upload" as GraphQLType
    } as const
} as const;

@Component
class PostTag extends BaseComponent {}

@Component
class TitleComponent extends BaseComponent {
    @CompData()
    value: string = "";
}

@Component
class ContentComponent extends BaseComponent {
    @CompData()
    value: string = "";
}

@Component
class AuthorComponent extends BaseComponent {
    @CompData()
    value: string = "";
}

@Component
class DateComponent extends BaseComponent {
    @CompData()
    value: Date = new Date();
}

const PostArcheType = new ArcheType([
    PostTag,
    TitleComponent,
    ContentComponent,
    AuthorComponent,
    DateComponent,
    UploadComponent // Include upload component in archetype
]);

const postFields = {
    id: GraphQLFieldTypes.ID_REQUIRED,
    title: GraphQLFieldTypes.STRING_REQUIRED,
    content: GraphQLFieldTypes.STRING_REQUIRED,
    date: GraphQLFieldTypes.STRING_OPTIONAL,
    author: "User!" as GraphQLType,
    comments: "[Comment]" as GraphQLType,
    image: GraphQLFieldTypes.STRING_OPTIONAL,
};

@GraphQLObjectType({
    name: "Post",
    fields: postFields
})
@GraphQLObjectType({
    name: "Comment",
    fields: {
        id: GraphQLFieldTypes.ID_REQUIRED,
        author: GraphQLFieldTypes.ID_REQUIRED,
        postId: GraphQLFieldTypes.ID_REQUIRED,
        content: GraphQLFieldTypes.STRING_REQUIRED,
        date: "Date",
    }
})
@GraphQLScalarType("Date")
@GraphQLScalarType("Upload")
class PostServiceRefactored extends BaseService {
    // #region Post Queries
    
    @GraphQLOperation({
        type: "Query",
        input: PostInputs.posts,
        output: "[Post]"
    })
    @timed("PostServiceRefactored.posts")
    async posts(args: ResolverInput<typeof PostInputs.posts>, context: any, info: any): Promise<Entity[]> {
        const query = new Query().with(PostTag);
        
        const componentsToLoad: (new () => BaseComponent)[] = [
            TitleComponent, 
            ContentComponent, 
            DateComponent
        ];
        
        if (isFieldRequested(info, 'author')) {
            componentsToLoad.push(AuthorComponent);
        }
        if (isFieldRequested(info, 'image')) {
            componentsToLoad.push(UploadComponent);
        }
        
        query.eagerLoadComponents(componentsToLoad);
        
        if (args.id) {
            query.findById(args.id);
        }
        
        const entities = await query.exec();
        
        // Batch load authors if needed
        if (isFieldRequested(info, 'author')) {
            context.authors = await BatchLoader.loadRelatedEntitiesBatched(
                entities,
                AuthorComponent,
                Entity.LoadMultiple
            );
        }
        
        return entities;
    }

    // #endregion

    // #region Post Mutations
    
    @GraphQLOperation({
        type: "Mutation",
        input: PostInputs.createPost,
        output: "Post"
    })
    async createPost(
        args: ResolverInput<typeof PostInputs.createPost>, 
        context: any, 
        info: any
    ): Promise<Entity> {
        try {
            const author = await Entity.FindById(args.author);
            if (!author) {
                throw responseError("Author not found", {
                    extensions: {
                        code: "AUTHOR_NOT_FOUND",
                        field: "author"
                    }
                });
            }

            // Create post entity
            const post = PostArcheType.fill({
                title: args.title,
                content: args.content,
                author: args.author,
                date: args.date ? new Date(args.date) : undefined
            }).createEntity();

            // Handle image upload using the new upload system
            if (args.image) {
                const uploadResult = await UploadHelper.processUploadForEntity(
                    post,
                    args.image as File,
                    IMAGE_UPLOAD_CONFIG
                );

                if (!uploadResult.success) {
                    throw responseError("Image upload failed", {
                        extensions: {
                            code: "UPLOAD_FAILED",
                            details: uploadResult.error
                        }
                    });
                }
            }

            await post.save();
            return post;
            
        } catch (err) {
            handleGraphQLError(err);
        }
    }

    /**
     * Add image to existing post
     */
    @GraphQLOperation({
        type: "Mutation",
        input: {
            postId: GraphQLFieldTypes.ID_REQUIRED,
            image: "Upload!" as GraphQLType
        },
        output: "Post"
    })
    async addImageToPost(
        args: { postId: string; image: File },
        context: any
    ): Promise<Entity | null> {
        try {
            const post = await Entity.FindById(args.postId);
            if (!post) {
                throw responseError("Post not found", {
                    extensions: { code: "POST_NOT_FOUND" }
                });
            }

            // Replace existing upload if present
            const uploadResult = await UploadHelper.replaceUploadForEntity(
                post,
                args.image,
                IMAGE_UPLOAD_CONFIG
            );

            if (!uploadResult.success) {
                throw responseError("Image upload failed", {
                    extensions: {
                        code: "UPLOAD_FAILED",
                        details: uploadResult.error
                    }
                });
            }

            await post.save();
            return post;

        } catch (err) {
            handleGraphQLError(err);
        }
    }

    // #endregion

    // #region Field Resolvers

    @GraphQLField({type: "Post", field: "id"})
    async idResolver(parent: Entity, args: any, context: any, info: any) {
        return parent.id;
    }
    
    @GraphQLField({type: "Post", field: "title"})
    async titleResolver(parent: Entity, args: any, context: any, info: any) {
        const data = await parent.get(TitleComponent);
        return data?.value || "";
    }

    @GraphQLField({type: "Post", field: "content"})
    async contentResolver(parent: Entity, args: any, context: any, info: any) {
        const data = await parent.get(ContentComponent);
        return data?.value || "";
    }

    @GraphQLField({type: "Post", field: "date"})
    async dateResolver(parent: Entity, args: any, context: any, info: any) {
        const data = await parent.get(DateComponent);
        return data?.value || null;
    }

    @GraphQLField({type: "Post", field: "author"})
    async authorResolver(parent: Entity, args: any, context: any, info: any) {
        const data = await parent.get(AuthorComponent);
        const authorId = data?.value;
        if (!authorId) return null;
        
        // Use preloaded authors from context if available
        if (context.authors && context.authors.has(authorId)) {
            return context.authors.get(authorId);
        }
        
        // Fallback to individual query
        const authorEntity = await Entity.FindById(authorId);
        return authorEntity;
    }

    @GraphQLField({type: "Post", field: "image"})
    async imageResolver(parent: Entity, args: any, context: any, info: any) {
        const uploadData = await parent.get(UploadComponent);
        
        if (!uploadData) {
            return null;
        }
        
        // Return the image URL
        return uploadData.url;
    }

    /**
     * Additional resolver for getting detailed image information
     */
    @GraphQLField({type: "Post", field: "imageDetails"})
    async imageDetailsResolver(parent: Entity, args: any, context: any, info: any) {
        const uploadData = await parent.get(UploadComponent);
        const imageMetadata = await parent.get(ImageMetadataComponent);
        
        if (!uploadData) {
            return null;
        }
        
        return {
            url: uploadData.url,
            fileName: uploadData.fileName,
            originalFileName: uploadData.originalFileName,
            size: uploadData.size,
            mimeType: uploadData.mimeType,
            width: imageMetadata?.width || 0,
            height: imageMetadata?.height || 0,
            thumbnails: imageMetadata ? JSON.parse(imageMetadata.thumbnails || '[]') : []
        };
    }

    // #endregion

    // #region Utility Methods

    /**
     * Get storage usage for all posts
     */
    async getPostsStorageUsage(): Promise<number> {
        const posts = await new Query().with(PostTag).exec();
        let totalUsage = 0;
        
        for (const post of posts) {
            const usage = await UploadHelper.getEntityStorageUsage(post);
            totalUsage += usage;
        }
        
        return totalUsage;
    }

    /**
     * Clean up orphaned uploads
     */
    async cleanupOrphanedUploads(): Promise<number> {
        const posts = await new Query().with(PostTag).exec();
        let totalCleaned = 0;
        
        for (const post of posts) {
            const cleaned = await UploadHelper.cleanupOrphanedUploads(post);
            totalCleaned += cleaned;
        }
        
        return totalCleaned;
    }

    // #endregion
}

export default PostServiceRefactored;
export { PostTag, TitleComponent, ContentComponent, AuthorComponent };