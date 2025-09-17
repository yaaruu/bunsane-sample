import {
    BaseService,
    Post
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
    ComponentTargetHook,
    type EntityCreatedEvent,
    logger,
    ScheduledTask,
    ScheduleInterval
} from "bunsane";
import type { GraphQLContext, GraphQLInfo } from "bunsane/types/graphql.types";
import * as z from "zod";

import jwt from "jsonwebtoken";
import { Authenticated } from "src/helpers/AuthHelper";
import { eagerComponentsForInfo } from "../helpers/gqlEagerLoader";
import { PostTag, AuthorComponent, TitleComponent, ContentComponent, ImageViewComponent } from "./PostService";

@Component
export class UserTag extends BaseComponent {}
@Component
export class EmailComponent extends BaseComponent {
    @CompData()
    value: string = "";
}
@Component
export class NameComponent extends BaseComponent {
    @CompData()
    value: string = ""
}
@Component
export class PhoneComponent extends BaseComponent {
    @CompData()
    value: string = "";
}
@Component
export class PasswordComponent extends BaseComponent {
    @CompData()
    value: string = "";
}

const UserArcheType = new ArcheType([
    UserTag,
    NameComponent,
    EmailComponent,
    PasswordComponent,
    PhoneComponent
]);


const userFields = {
    id: GraphQLFieldTypes.ID_REQUIRED,
    name: GraphQLFieldTypes.STRING_OPTIONAL,
    email: GraphQLFieldTypes.STRING_REQUIRED,
    phone: GraphQLFieldTypes.STRING_OPTIONAL,
    post: "[Post]" as GraphQLType
};

// Input type definitions
const UserInputs = {
    users: {
        id: GraphQLFieldTypes.ID_OPTIONAL
    } as const,
    register: {
        email: GraphQLFieldTypes.STRING_REQUIRED,
        name: GraphQLFieldTypes.STRING_REQUIRED,
        password: GraphQLFieldTypes.STRING_REQUIRED
    } as const,
    updateUser: {
        id: GraphQLFieldTypes.ID_REQUIRED,
        name: GraphQLFieldTypes.STRING_OPTIONAL,
        email: GraphQLFieldTypes.STRING_OPTIONAL,
        password: GraphQLFieldTypes.STRING_OPTIONAL,
        phone: GraphQLFieldTypes.STRING_OPTIONAL
    } as const
} as const;

@GraphQLObjectType({
    name: "User",
    fields: userFields
})
@GraphQLScalarType("Date")
class UserService extends BaseService {

    @ScheduledTask({
        interval: ScheduleInterval.MINUTE,
        componentTarget: UserTag
    })
    async checkUserPerMinutes(entities: Entity[]) {
        logger.info(`Scheduled Task: checkUserPerMinutes executed for ${entities.length} users`);
    }

    @ComponentTargetHook("entity.created", {
        includeComponents: [UserTag, EmailComponent]
    })
    async onUserCreate(event: EntityCreatedEvent) {
        const emailComp = await event.entity.get(EmailComponent);
        logger.info(`New user created with email: ${emailComp?.value}`);
        // Here you could add logic to send a welcome email, etc.
    }


    @Post("/auth/login")
    async userLogin(req: Request, res: Response) {
        const testJwt = jwt.sign({userId: "test-user-id"}, process.env.JWT_SECRET || "secret", {
            issuer: 'bunsane-example',
            audience: 'bunsane-users',
            algorithm: 'HS256',
            expiresIn: '1h'
        });

        jwt.verify(testJwt, process.env.JWT_SECRET || "secret", (err, decoded) => {
            if (err) {
                console.error("JWT Verification Error:", err);
            }
        });
        return new Response(JSON.stringify({
            message: "Login endpoint",
            token: testJwt
        }), { status: 200 });
    }

    @Post("/auth/register")
    async userRegister(req: Request, res: Response) {
        try {
            const body = await req.json();
            const input = RegisterValidationSchema.parse(body);
            const check = await new Query()
                .with(UserTag)
                .with(EmailComponent, 
                    Query.filters(
                        Query.filter("value", Query.filterOp.EQ, input.email)
                    )
                )
                .exec();
            if(check.length > 0) {
                return new Response(JSON.stringify({
                    error: "Email already in use",
                    code: "EMAIL_ALREADY_EXISTS"
                }), { status: 400 });
            }
            const entity = UserArcheType.fill(input)
                .createEntity();
            await entity.save();

            return new Response(JSON.stringify({
                message: "User registered successfully",
                user: (await UserArcheType.Unwrap(entity, ['password']))
            }), { status: 201 });
        } catch (err) {
            if (err instanceof z.ZodError) {
                return new Response(JSON.stringify({
                    error: "Validation error",
                    details: err.issues
                }), { status: 400 });
            }
            console.error(err);
            return new Response(JSON.stringify({
                error: "Internal server error"
            }), { status: 500 });
        }
    }

    // #region User Queries
    @GraphQLOperation({
        type: "Query",
        input: UserInputs.users,
        output: "[User]"
    })
    async getUsers(args: ResolverInput<typeof UserInputs.users>, context: GraphQLContext, info: GraphQLInfo) {
        if (!context.request) {
            throw new Error("Request context is required");
        }
        Authenticated(context.request, context);
        const { id } = args;
        const query = new Query().with(UserTag);
        if (id) {
            query.findById(id);
        }
        
        // map selection names to components to eager-load
        const mapping = {
            name: [NameComponent],
            email: [EmailComponent],
            phone: [PhoneComponent]
        };
        const toLoad = eagerComponentsForInfo(info, mapping);
        if (toLoad.length > 0) {
            query.eagerLoadComponents(toLoad);
        }
        
        const entities = await query.exec();

        // Preload posts for all users using optimized batching only if 'post' field is requested
        if (entities.length > 0 && isFieldRequested(info, 'post')) {
            const userIds = entities.map(e => e.id);
            
            // Create mapping for post fields to components
            const postMapping = {
                'post.title': [TitleComponent],
                'post.content': [ContentComponent],
                'post.image': [ImageViewComponent],
                'post.author': [AuthorComponent]
            };
            
            // Use helper to determine which components to load based on requested post fields
            const postComponentsToLoad = eagerComponentsForInfo(info, postMapping);
            
            const allPosts = await new Query()
                .with(PostTag)
                .with(AuthorComponent, 
                    Query.filters(
                        Query.filter("value", Query.filterOp.IN, userIds)
                    )
                )
                .eagerLoadComponents(postComponentsToLoad)
                .exec();

            const postsByAuthor = new Map<string, Entity[]>();
            for (const post of allPosts) {
                const authorComp = await post.get(AuthorComponent);
                const authorId = authorComp?.value;
                if (authorId) {
                    if (!postsByAuthor.has(authorId)) {
                        postsByAuthor.set(authorId, []);
                    }
                    postsByAuthor.get(authorId)!.push(post);
                }
            }
            context.postsByAuthor = postsByAuthor;
        }

        return entities;
    }
    // #endregion

    // #region User Mutations
    @GraphQLOperation({
        type: "Mutation",
        input: UserInputs.register,
        output: "User"
    })
    async registerUser(args: ResolverInput<typeof UserInputs.register>, context: GraphQLContext ) {
        try {
            const input = RegisterValidationSchema.parse(args);
            const check = await new Query()
                .with(UserTag)
                .with(EmailComponent, 
                    Query.filters(
                        Query.filter("value", Query.filterOp.EQ, input.email)
                    )
                )
                .exec();
            if(check.length > 0) {
                throw responseError("Email already in use", {
                    extensions: {
                        code: "EMAIL_ALREADY_EXISTS",
                        field: "email"
                    }
                });
            }
            const entity = UserArcheType.fill(input)
                .createEntity();
            await entity.save();
            return entity;
        } catch (err) {
            handleGraphQLError(err);
        }
    }

    @GraphQLOperation({
        type: "Mutation",
        input: UserInputs.updateUser,
        output: "User"
    })
    async updateUser(args: ResolverInput<typeof UserInputs.updateUser>, context: GraphQLContext) {
        try {
            const input = UpdateValidationSchema.parse(args);
            const query = new Query()
                .with(UserTag);
            
            const users = await query.findById(input.id).exec();
            if (!users || users.length === 0) {
                throw responseError("User not found", {
                    extensions: {
                        code: "USER_NOT_FOUND",
                        field: "id"
                    }
                });
            }
            const entity = users[0]!;
            if (input.email) { 
                // check if email is already used by other user
                const emailCheck = await new Query()
                    .with(UserTag)
                    .with(EmailComponent, 
                        Query.filters(
                            Query.filter("value", Query.filterOp.EQ, input.email)
                        )
                    )
                    .exec();

                if (emailCheck.length > 0 && emailCheck[0]!.id !== input.id) {
                    throw responseError("Email already in use", {
                        extensions: {
                            code: "EMAIL_ALREADY_EXISTS",
                            field: "email"
                        }
                    });
                }
            }
            await UserArcheType.updateEntity(entity, input);
            await entity.save();
            // TODO: Need a fix here for null checks or safety check
            return entity;
        } catch (err) {
            handleGraphQLError(err);
        }
    }

    // #endregion

    // #region Field Resolvers
    
    @GraphQLField({type: "User", field: "id"})
    idResolver(parent: Entity, args: any, context: GraphQLContext) {
        return parent.id;
    }

    @GraphQLField({type: "User", field: "email"})
    async emailResolver(parent: Entity, args: any, context: GraphQLContext) {
        const data = await parent.get(EmailComponent);
        return data?.value ?? "";
    }

    @GraphQLField({type: "User", field: "phone"})
    async phoneResolver(parent: Entity, args: any, context: GraphQLContext) {
        const data = await parent.get(PhoneComponent);
        return data?.value ?? null;
    }

    @GraphQLField({type: "User", field: "name"})
    async nameResolver(parent: Entity, args: any, context: GraphQLContext) {
        const data = await parent.get(NameComponent);
        return data?.value ?? "";
    }

    // #endregion
}

const RegisterValidationSchema = z.object({
    email: z.email(),
    name: z.string().min(1).max(100),
    password: z.string().min(6).max(100)
})

const UpdateValidationSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1).max(100).optional(),
    email: z.email().optional(),
    password: z.string().min(6).max(100).optional(),
    phone: z.string().min(10).max(13).optional()
})

export default UserService;

