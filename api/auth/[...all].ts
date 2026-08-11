import { toNodeHandler } from "better-auth/node";
import { auth } from "../_lib/auth.js";

// Better Auth reads the raw request body itself, so Vercel's automatic JSON
// parsing has to be turned off for this route or sign-in payloads arrive empty.
export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth);
