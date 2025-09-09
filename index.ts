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
        ServiceRegistry.registerService(new UserService());
        ServiceRegistry.registerService(new PostService());

        this.addYogaPlugin(useJWT({
            signingKeyProviders: [
                createInlineSigningKeyProvider(signinKey)
            ],

            tokenLookupLocations: [extractFromHeader({name: 'Authorization', prefix: 'Bearer '})],

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
        }))
    }
}

const app = new MyApp();

