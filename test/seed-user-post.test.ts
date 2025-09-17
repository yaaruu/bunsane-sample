import { describe, it, beforeAll } from "bun:test";
import { ArcheType, Entity, Query, BaseComponent, CompData, Component } from "bunsane";
import { UserTag, NameComponent, EmailComponent, PasswordComponent, PhoneComponent } from "../src/services/UserService";
import { PostTag, TitleComponent, ContentComponent, AuthorComponent, ImageViewComponent } from "../src/services/PostService";
import MyApp from "../index";
import { ServiceRegistry } from "bunsane/service";
import UserService from "../src/services/UserService";
import PostService from "../src/services/PostService";

@Component
class DateComponent extends BaseComponent {
    @CompData()
    value: Date = new Date();
}

const UserArcheType = new ArcheType([
    UserTag,
    NameComponent,
    EmailComponent,
    PasswordComponent,
    PhoneComponent
]);

const PostArcheType = new ArcheType([
    PostTag,
    TitleComponent,
    ContentComponent,
    AuthorComponent,
    DateComponent,
    ImageViewComponent
]);

async function createUser(name: string, email: string, password: string) {
    const entity = UserArcheType.fill({
        name,
        email,
        password
    }).createEntity();
    await entity.save();
    return entity;
}

async function createPost(title: string, content: string, authorId: string) {
    const entity = PostArcheType.fill({
        title,
        content,
        author: authorId,
        date: new Date()
    }).createEntity();
    await entity.save();
    return entity;
}

describe("Seed Users and Posts", () => {
    let app: MyApp;

    beforeAll(async () => {
        app = new MyApp();
        // Explicitly register services to ensure components are available
        ServiceRegistry.registerService(new UserService());
        ServiceRegistry.registerService(new PostService());
        // Wait for the application to be fully ready (components registered, etc.)
        await app.waitForAppReady();
    });

    it("should seed 100 users with 5 posts each", async () => {
        for (let i = 1; i <= 100; i++) {
            const user = await createUser(`User ${i}`, `user${i}@example.com`, `password${i}`);
            console.log(`Created user: ${user.id}`);

            for (let j = 1; j <= 5; j++) {
                const post = await createPost(`Post ${j} by User ${i}`, `Content for post ${j} by user ${i}`, user.id);
                console.log(`Created post: ${post.id} for user ${user.id}`);
            }
        }
    });

    it("should verify data was successfully added to database", async () => {
        // Query all users
        const allUsers = await new Query().with(UserTag).exec();
        
        // Verify we have exactly 100 users
        console.assert(allUsers.length === 100, `Expected 100 users, but found ${allUsers.length}`);
        
        // Query all posts
        const allPosts = await new Query().with(PostTag).exec();
        
        // Verify we have exactly 500 posts
        console.assert(allPosts.length === 500, `Expected 500 posts, but found ${allPosts.length}`);
        
        // Verify each user has exactly 5 posts
        for (const user of allUsers) {
            const userPosts = await new Query()
                .with(PostTag)
                .with(AuthorComponent, 
                    Query.filters(
                        Query.filter("value", Query.filterOp.EQ, user.id)
                    )
                )
                .exec();
            
            console.assert(userPosts.length === 5, `User ${user.id} should have 5 posts, but has ${userPosts.length}`);
            
            // Verify post content matches expected pattern
            for (let j = 0; j < userPosts.length; j++) {
                const post = userPosts[j]!;
                const titleComp = await post.get(TitleComponent);
                const contentComp = await post.get(ContentComponent);
                const authorComp = await post.get(AuthorComponent);
                
                console.assert(titleComp?.value.includes(`Post ${j + 1}`), `Post title doesn't match expected pattern`);
                console.assert(contentComp?.value.includes(`Content for post ${j + 1}`), `Post content doesn't match expected pattern`);
                console.assert(authorComp?.value === user.id, `Post author doesn't match user ID`);
            }
        }
        
        // Verify user data integrity
        for (let i = 1; i <= 100; i++) {
            const users = await new Query()
                .with(UserTag)
                .with(EmailComponent, 
                    Query.filters(
                        Query.filter("value", Query.filterOp.EQ, `user${i}@example.com`)
                    )
                )
                .exec();
            
            console.assert(users.length === 1, `Should find exactly 1 user with email user${i}@example.com`);
            
            const user = users[0]!;
            const nameComp = await user.get(NameComponent);
            const emailComp = await user.get(EmailComponent);
            
            console.assert(nameComp?.value === `User ${i}`, `User name doesn't match expected value`);
            console.assert(emailComp?.value === `user${i}@example.com`, `User email doesn't match expected value`);
        }
        
        console.log("✅ All data verification checks passed!");
        console.log(`✅ Verified ${allUsers.length} users and ${allPosts.length} posts`);
    });
});
