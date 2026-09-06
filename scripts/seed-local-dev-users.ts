import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

import { seedLocalDevUsers } from "../src/lib/dev-users.js";

try {
  for (const file of [".env.development.local", ".env.local", ".env.development", ".env"]) {
    const envPath = path.resolve(file);
    if (existsSync(envPath)) loadEnvFile(envPath);
  }
  const result = await seedLocalDevUsers();
  console.log(`${result.users} lokale dummygebruikers en ${result.groups} Smartschoolgroepen zijn klaar.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lokale dummygebruikers konden niet worden aangemaakt.");
  process.exitCode = 1;
}
