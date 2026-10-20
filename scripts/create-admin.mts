/**
 * Safe administrator bootstrap — there is deliberately no web page that can create an admin.
 *
 *   npm run admin:create -- --email owner@example.com --name "Emri Mbiemri"
 *
 * Creates the account without a password, emails a single-use setup link and prints it,
 * so the owner can set their own password.
 */
import "dotenv/config";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });

if (!values.email || !values.name) {
  console.error('Usage: npm run admin:create -- --email <email> --name "<full name>"');
  process.exit(1);
}

// Imported after dotenv so env validation sees the variables.
const { createAccount, sendAccountSetupEmail } = await import("@/server/services/accounts");
const { prisma } = await import("@/server/db");

try {
  const user = await createAccount({ email: values.email, name: values.name, role: "admin" }, null);
  const url = await sendAccountSetupEmail(user);
  console.log(`Administrator created: ${user.email}`);
  console.log(`Setup link (single use, 72 hours) — also sent by email:\n${url}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
