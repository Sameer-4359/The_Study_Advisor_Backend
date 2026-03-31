import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { getVectorStore } from "../lib/ragClient.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Explicitly load .env from project root
const envPath = path.join(ROOT, ".env");
config({ path: envPath });

const TRACK_FILE = path.join(ROOT, "data", "indexed_files.json");

async function main() {
  console.log("Resetting Pinecone namespace (deleteAll)...");
  const vectorStore = await getVectorStore();
  await vectorStore.delete({ deleteAll: true });
  console.log("Pinecone vectors cleared.");

  if (await fs.pathExists(TRACK_FILE)) {
    await fs.remove(TRACK_FILE);
    console.log("Removed data/indexed_files.json");
  }

  console.log("Reset complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
