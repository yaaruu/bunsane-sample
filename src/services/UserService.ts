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
import { 
    Entity, 
    BaseComponent, 
    CompData, 
    Component, 
    ArcheType,
    Query, 
    responseError, 
    handleGraphQLError 
} from "bunsane";
import * as z from "zod";

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

type UserData = {
    name: string;
    email: string;
    password: string;
    phone?: string;
};

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
class UserService extends BaseService {
    // #region User Queries
    @GraphQLOperation({
        type: "Query",
        input: UserInputs.users,
        output: "[User]"
    })
    async getUsers(args: ResolverInput<typeof UserInputs.users>, context: any) {
        const { id } = args;
        const query = new Query().with(UserTag);
        if (id) {
            query.findById(id);
        }
        const entities = await query.exec();
        console.log(entities);
        return entities;
    }
    // #endregion

    // #region User Mutations
    @GraphQLOperation({
        type: "Mutation",
        input: UserInputs.register,
        output: "User"
    })
    async registerUser(args: ResolverInput<typeof UserInputs.register>, context: any ) {
        try {
            const input = RegisterValidationSchema.parse(args);
            const check = await new Query()
                .with(UserTag)
                .with(EmailComponent, 
                    Query.filters(
                        Query.filter("value", "=", input.email)
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
    async updateUser(args: ResolverInput<typeof UserInputs.updateUser>, context: any) {
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
                            Query.filter("value", "=", input.email)
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
    idResolver(parent: Entity, args: any, context: any) {
        return parent.id;
    }

    @GraphQLField({type: "User", field: "email"})
    async emailResolver(parent: Entity, args: any, context: any) {
        const data = await parent.get(EmailComponent);
        return data?.value ?? "";
    }

    @GraphQLField({type: "User", field: "phone"})
    async phoneResolver(parent: Entity, args: any, context: any) {
        const data = await parent.get(PhoneComponent);
        return data?.value ?? null;
    }

    @GraphQLField({type: "User", field: "name"})
    async nameResolver(parent: Entity, args: any, context: any) {
        console.log(parent);
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