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
import { UploadHelper } from "bunsane/utils/UploadHelper";
import { UploadComponent } from "bunsane/core/components/UploadComponent";



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

@Component
class ImageViewComponent extends BaseComponent { // Relation to Image Entity
    @CompData()
    value: string | null = "";
}

const PostArcheType = new ArcheType([
    PostTag,
    TitleComponent,
    ContentComponent,
    AuthorComponent,
    DateComponent,
    ImageViewComponent
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
class PostService extends BaseService {
    // #region Post Queries
    
    @GraphQLOperation({
        type: "Query",
        input: PostInputs.posts,
        output: "[Post]"
    })
    @timed("PostService.posts")
    async posts(args: ResolverInput<typeof PostInputs.posts>, context: any, info: any): Promise<Entity[]> {
        // Build query with eager loading based on requested fields
        const query = new Query().with(PostTag);
        
        // Always load core components (id is always needed)
        const componentsToLoad: (new () => BaseComponent)[] = [TitleComponent, ContentComponent, DateComponent];
        if (isFieldRequested(info, 'author')) {
            componentsToLoad.push(AuthorComponent);
        }
        if (isFieldRequested(info, 'image')) {
            componentsToLoad.push(ImageViewComponent);
        }
        
        // Use eagerLoadComponents for better performance
        query.eagerLoadComponents(componentsToLoad);
        
        if (args.id) {
            query.findById(args.id);
        }
        
        // Apply pagination if provided
        if (args.limit) {
            query.take(args.limit);
        }
        if (args.offset) {
            query.offset(args.offset);
        }
        
        const entities = await query.exec();
        
        // Use loadRelatedEntitiesBatched for optimal relationship loading
        if (isFieldRequested(info, 'image')) {
            context.images = await BatchLoader.loadRelatedEntitiesBatched(
                entities,
                ImageViewComponent,
                Entity.LoadMultiple
            );
        }
       
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
    async createPost(args: ResolverInput<typeof PostInputs.createPost>, context: any, info: any): Promise<Entity> {
        try {
            const author = await Entity.FindById(args.author);
            if(!author) {
                throw responseError("Author not found", {
                    extensions: {
                        code: "AUTHOR_NOT_FOUND",
                        field: "author"
                    }
                });
            }
            const post = PostArcheType.fill({
                ...args,
                date: args.date ? new Date(args.date) : undefined
            }).createEntity();

            const imageEntity = args.image ? Entity.Create() : null;
            
            if(imageEntity && args.image) {
                const image = args.image as File;
                
                // Use the new Upload Feature to handle file uploads
                const uploadResult = await UploadHelper.processUploadForEntity(
                    imageEntity,
                    image,
                    {
                        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
                        maxFileSize: 10 * 1024 * 1024, // 10MB
                        uploadPath: "uploads",
                        namingStrategy: "uuid",
                        generateThumbnails: true
                    }
                );

                if (!uploadResult.success) {
                    throw responseError(`File upload failed: ${uploadResult.error?.message}`, {
                        extensions: {
                            code: "UPLOAD_FAILED",
                            field: "image",
                            details: uploadResult.error
                        }
                    });
                }

                await imageEntity.save();
            }

            post.add(ImageViewComponent, {value: imageEntity ? imageEntity.id : null});
            await post.save();
            return post;
        } catch (err) {
            handleGraphQLError(err);
        }
        
    }

    // #endregion

    // #region Post Field Resolvers

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
        
        // Fallback to individual query if not preloaded
        const authorEntity = await Entity.FindById(authorId);
        return authorEntity;
    }

    @GraphQLField({type: "Post", field: "image"})
    async imageResolver(parent: Entity, args: any, context: any, info: any) {
        const data = await parent.get(ImageViewComponent);
        const imageId = data?.value;

        if (context.images && context.images.has(imageId)) {
            const imageEntity = context.images.get(imageId);
            if(!imageEntity) return null;
            const uploadData = await imageEntity.get(UploadComponent);
            return uploadData?.url || null;
        }

        if(!imageId) return null;
        const imageEntity = await Entity.FindById(imageId);
        if(!imageEntity) return null;
        const uploadData = await imageEntity.get(UploadComponent);
        return uploadData?.url || null;
    }

    // #endregion

    // #region User Field Resolvers
    
    @GraphQLField({type: "User", field: "post"})
    async postsResolver(parent: Entity, args: any, context: any, info: any): Promise<Entity[]> {
        // Use preloaded posts if available
        if (context.postsByAuthor && context.postsByAuthor.has(parent.id)) {
            return context.postsByAuthor.get(parent.id);
        }

        // Fallback to individual query
        const query = new Query()
            .with(PostTag)
            .with(AuthorComponent, 
                Query.filters(
                    Query.filter("value", Query.filterOp.EQ, parent.id),
                )
            );

        const entities = await query.exec();
        return entities;
    }

    // #endregion
}

export default PostService;
export { PostTag, TitleComponent, ContentComponent, AuthorComponent, ImageViewComponent };