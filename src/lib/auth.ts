import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { db } from "@/db";
import * as schema from "@/db/schema";

/** Where the app is served. Coding agents connect to `${APP_URL}/api/mcp`; set BETTER_AUTH_URL in production. */
export const APP_URL = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const MCP_RESOURCE = `${APP_URL}/api/mcp`;
export const MCP_SCOPES = ["argus:read", "argus:write"] as const;

export const auth = betterAuth({
  baseURL: APP_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  // Dev servers move to another port when 3000 is taken, so accept any localhost port outside production.
  // In production set BETTER_AUTH_URL to the deployed origin.
  trustedOrigins: process.env.NODE_ENV === "production" ? [] : ["http://localhost:*", "http://127.0.0.1:*"],
  // The JWT plugin's own /token would shadow the OAuth token endpoint.
  disabledPaths: ["/token"],
  plugins: [
    jwt(),
    // ARGUS as an OAuth server for MCP clients (Claude Code, Muse): the agent opens /login, the person
    // signs in and approves on /consent, and the agent gets a token bound to /api/mcp.
    mcp({
      loginPage: "/login",
      consentPage: "/consent",
      resource: MCP_RESOURCE,
      scopes: ["openid", "profile", "email", "offline_access", ...MCP_SCOPES],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
    }),
    nextCookies(),
  ],
});
