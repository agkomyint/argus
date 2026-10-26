import { auth } from "@/lib/auth";

// RFC 9728 metadata for /api/mcp. The mcp plugin answers it by full pathname, so pass the request straight through.
export const GET = (request: Request) => auth.handler(request);
