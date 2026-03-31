import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import crypto from "crypto";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PineconeStore } from "@langchain/pinecone";
import {
  getEmbeddings,
  getPineconeIndex,
  getGoogleApiKey,
} from "../lib/ragClient.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Explicitly load .env from project root
const envPath = path.join(ROOT, ".env");
config({ path: envPath });

const PDF_DIR = path.join(ROOT, "data", "pdfs");
const TRACK_FILE = path.join(ROOT, "data", "indexed_files.json");
const NAMESPACE = process.env.PINECONE_NAMESPACE ?? "";

function md5(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

async function ensureTrackFile() {
  await fs.ensureDir(path.dirname(TRACK_FILE));
  if (!(await fs.pathExists(TRACK_FILE))) {
    await fs.writeJson(TRACK_FILE, {}, { spaces: 2 });
  }
}

async function loadTrack() {
  await ensureTrackFile();
  return fs.readJson(TRACK_FILE);
}

async function saveTrack(obj) {
  await fs.writeJson(TRACK_FILE, obj, { spaces: 2 });
}

async function extractPdfText(buffer) {
  // pdf-parse doesn't easily return pages without a complex renderer.
  // We will extract the full text and split it.
  // If individual page numbers are critical, we might need a more complex solution,
  // but for now, we'll try to get the full text.
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (err) {
    console.error("PDF Parsing Error:", err);
    return "";
  }
}

async function main() {
  if (!getGoogleApiKey()) {
    console.error("Missing Google API key for embeddings.");
    process.exit(1);
  }

  await fs.ensureDir(PDF_DIR);
  await ensureTrackFile();

  const track = await loadTrack();
  const files = (await fs.readdir(PDF_DIR)).filter((f) =>
    f.toLowerCase().endsWith(".pdf")
  );

  if (files.length === 0) {
    console.log(`No PDFs found in ${PDF_DIR}. Add files and run again.`);
    return;
  }

  const embeddings = getEmbeddings();
  const pineconeIndex = getPineconeIndex();
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: NAMESPACE || undefined,
    textKey: "text",
  });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  for (const filename of files) {
    const filePath = path.join(PDF_DIR, filename);
    const buffer = await fs.readFile(filePath);
    const hash = md5(buffer);

    if (track[filename] === hash) {
      console.log(`Skipping ${filename} (No changes)...`);
      continue;
    }

    console.log(`Indexing ${filename}...`);

    try {
      // Create a filter to delete old entries if any
      // Note: Pinecone delete by filter might require certain index setups
      await vectorStore.delete({
        filter: { filename: { $eq: filename } },
      });
    } catch (e) {
      console.warn(`Delete filter for ${filename} (can be ignored if new index):`, e.message || e);
    }

    const fullText = await extractPdfText(buffer);
    if (!fullText.trim()) {
      console.warn(`No text extracted from ${filename}, skipping.`);
      continue;
    }

    const chunks = await splitter.splitText(fullText);
    const documents = chunks.map((chunk, i) => {
      return new Document({
        pageContent: chunk,
        metadata: {
          filename,
          hash,
          chunkIndex: String(i),
        },
      });
    });

    await vectorStore.addDocuments(documents);
    track[filename] = hash;
    await saveTrack(track);
    console.log(`Indexed ${filename} (${documents.length} chunks).`);
  }

  console.log("Ingest complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

