import {
    BaseService,
} from "bunsane/service";
import { 
    GraphQLField, 
    GraphQLOperation, 
    GraphQLObjectType, 
    GraphQLFieldTypes,
    type ResolverInput,
    type GraphQLType
} from "bunsane/gql";
import { Entity, BaseComponent, CompData, Component, ArcheType, Query, responseError, handleGraphQLError } from "bunsane";

const postFields = {
    id: GraphQLFieldTypes.ID_REQUIRED,
    title: GraphQLFieldTypes.STRING_REQUIRED,
    content: GraphQLFieldTypes.STRING_REQUIRED,
    date: GraphQLFieldTypes.STRING_OPTIONAL,
    author: "User!" as GraphQLType,
    comments: "[Comment]" as GraphQLType
};

// Input type definitions
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
        date: GraphQLFieldTypes.STRING_OPTIONAL
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
    DateComponent
]);


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
        date: GraphQLFieldTypes.STRING_OPTIONAL,
    }
})
class PostService extends BaseService {
    // #region Post Queries
    
    @GraphQLOperation({
        type: "Query",
        input: PostInputs.posts,
        output: "[Post]"
    })
    async posts(args: ResolverInput<typeof PostInputs.posts>): Promise<Entity[]> {
        const query = new Query().with(PostTag);
        if (args.id) {
            query.findById(args.id);
        }
        const entities = await query.exec();
        return entities;
    }

    // #endregion

    // #region Post Mutations
    
    @GraphQLOperation({
        type: "Mutation",
        input: PostInputs.createPost,
        output: "Post"
    })
    async createPost(args: ResolverInput<typeof PostInputs.createPost>): Promise<Entity> {
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

            await post.save();
            return post;
        } catch (err) {
            handleGraphQLError(err);
        }
        
    }

    // #endregion

    // #region Post Field Resolvers

    @GraphQLField({type: "Post", field: "id"})
    async idResolver(parent: Entity, args: any, context: any) {
        return parent.id;
    }
    
    @GraphQLField({type: "Post", field: "title"})
    async titleResolver(parent: Entity, args: any, context: any) {
        const data = await parent.get(TitleComponent);
        return data?.value || "";
    }

    @GraphQLField({type: "Post", field: "content"})
    async contentResolver(parent: Entity, args: any, context: any) {
        const data = await parent.get(ContentComponent);
        return data?.value || "";
    }

    @GraphQLField({type: "Post", field: "date"})
    async dateResolver(parent: Entity, args: any, context: any) {
        const data = await parent.get(DateComponent);
        return data?.value || null;
    }

    @GraphQLField({type: "Post", field: "author"})
    async authorResolver(parent: Entity, args: any, context: any) {
        const data = await parent.get(AuthorComponent);
        const authorId = data?.value;
        const authorEntity = authorId ? await Entity.FindById(authorId) : null;
        return authorEntity;
    }

    // #endregion

    // #region User Field Resolvers
    
    @GraphQLField({type: "User", field: "post"})
    async postsResolver(parent: Entity, args: any, context: any): Promise<Entity[]> {
        const query = new Query()
            .with(PostTag)
            .with(AuthorComponent, 
                Query.filters(
                    Query.filter("value", "=", parent.id),
                )
            );

        const entities = await query.exec();
        return entities;
    }

    // #endregion
}

export default PostService;
export { PostTag, TitleComponent, ContentComponent, AuthorComponent };