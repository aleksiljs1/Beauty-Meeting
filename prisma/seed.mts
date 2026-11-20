/**
 * Local development seed - NEVER run against production.
 * Creates only the local development administrator, with no demo content or student accounts.
 * npm run db:seed creates it; npm run db:reset wipes and reseeds the development database.
 */
import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

// NODE_ENV is easy to leave unset when pointing a local shell at a hosted database, so the
// database's own address decides too: only a database on this machine is ever seeded.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
let databaseHost: string | null = null;
try {
  databaseHost = new URL(process.env.DATABASE_URL ?? "").hostname;
} catch {
  // unparsable: treated as not local
}
if (!databaseHost || !LOCAL_HOSTS.has(databaseHost)) {
  console.error(`Refusing to seed: DATABASE_URL must point to localhost (host is "${databaseHost ?? "unknown"}").`);
  process.exit(1);
}

const { prisma } = await import("@/server/db");
const { auth } = await import("@/server/auth/auth");

const EMAIL = "admin@akademia.local";
const NAME = "Administratori";
const PASSWORD = process.env.SEED_PASSWORD ?? "Demo-fjalekalim-2026";

try {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL }, select: { role: true } });

  if (existing) {
    if (existing.role !== "admin") {
      throw new Error(EMAIL + " already exists and is not an administrator.");
    }
    console.log("Seed administrator already exists: " + EMAIL + "; leaving it unchanged.");
  } else {
    const ctx = await auth.$context;
    const { user } = await auth.api.createUser({ body: { email: EMAIL, name: NAME, role: "admin" } });
    await ctx.internalAdapter.createAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(PASSWORD),
    });

    console.log("Seed complete (local development only).");
    console.log("Admin: " + EMAIL);
    console.log("Password: " + PASSWORD);
  }
} finally {
  await prisma.$disconnect();
}