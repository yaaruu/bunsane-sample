import {
    App,
    ServiceRegistry
} from "bunsane";
import { createInlineSigningKeyProvider, extractFromHeader, useJWT } from "@graphql-yoga/plugin-jwt";

const signinKey = process.env.JWT_SECRET || "secret";

import UserService from "./src/services/UserService";
import PostService from "./src/services/PostService";

export default class MyApp extends App {
    constructor() {
        super();
        const userService = new UserService();
        const postService = new PostService();
        
        ServiceRegistry.registerService(userService);
        ServiceRegistry.registerService(postService);

        this.addStaticAssets("/uploads", "./public/uploads");

        const jwtPlugin = useJWT({
            signingKeyProviders: [
                createInlineSigningKeyProvider(signinKey)
            ],

            tokenLookupLocations: [
                (params) => {
                    const auth = params.request.headers.get('authorization') || params.request.headers.get('Authorization');
                    if (auth && auth.startsWith('Bearer ')) {
                        return { token: auth.slice(7) };
                    }
                    return undefined;
                }
            ],

            tokenVerification: {
                issuer: 'bunsane-example',
                audience: 'bunsane-users',
                algorithms: ['HS256']
            },

            extendContext: true,
            reject: {
                missingToken: true,
                invalidToken: true
            }
        });

        // this.addYogaPlugin(jwtPlugin);
    }
}

const app = new MyApp();

