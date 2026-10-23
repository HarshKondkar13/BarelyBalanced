import { config } from "dotenv";
config({ path: ".env" });
process.env.TZ = "UTC"; // tests must not depend on the host timezone
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/[^/]+$/, "/paisa_test");
