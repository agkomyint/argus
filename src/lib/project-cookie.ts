// Which project is open. Lives apart from session.ts so the proxy can read it without loading the database.
export const PROJECT_COOKIE = "argus_project";
export const PROJECT_COOKIE_OPTIONS = { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 } as const;
