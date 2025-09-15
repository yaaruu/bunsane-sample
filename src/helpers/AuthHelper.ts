import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";

export type RequestWithJWT = Request & { jwt?: any }; 

export const Authenticated = (request: RequestWithJWT, context?: any) => {
    const headers = request.headers;
    const authorization = headers.get("Authorization") || headers.get("authorization");
    const token = authorization ? authorization.split(" ")[1] : null;
    const decoded = token ? jwt.verify(token, process.env.JWT_SECRET || "secret") : null;
    if(decoded && typeof decoded === "object" && "userId" in decoded) {
        if(context)  {
            context.jwt = {
                payload: decoded
            };
            return true;
        } else {
            request.jwt = {
                payload: decoded
            };
        }
    } else {
        throw new GraphQLError("Unauthorized", {
            extensions: {
                code: "UNAUTHORIZED"
            }
        });
    }
}