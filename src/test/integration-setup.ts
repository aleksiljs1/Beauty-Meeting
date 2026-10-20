import { execSync } from "node:child_process";

/** Brings the test database schema up to date before integration tests run. */
export default function setup() {
  execSync("npx prisma migrate deploy", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "postgresql://academy:academy_dev_password@localhost:5433/academy_test" },
  });
}
