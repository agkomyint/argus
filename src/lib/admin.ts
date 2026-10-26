import "server-only";

// Admins are listed by email in ADMIN_EMAILS (comma separated). Admin access is read-only observation.
export function isAdmin(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
