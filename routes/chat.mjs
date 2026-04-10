import "dotenv/config";
import express from "express";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KNOWLEDGE_FILE_PATH = resolve(
  __dirname,
  "..",
  "data",
  "chat_knowledge.json",
);

function getGoogleApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.LOVABLE_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

let knowledgeCache = null;

async function loadKnowledgeBase() {
  if (knowledgeCache) {
    return knowledgeCache;
  }

  const raw = await readFile(KNOWLEDGE_FILE_PATH, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.entries)) {
    throw new Error("chat_knowledge.json must contain an 'entries' array");
  }

  knowledgeCache = parsed.entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id ?? ""),
      title: String(entry.title ?? "Untitled"),
      content: String(entry.content ?? "").trim(),
      tags: Array.isArray(entry.tags)
        ? entry.tags.map((tag) => String(tag).toLowerCase())
        : [],
    }))
    .filter((entry) => entry.content.length > 0);

  return knowledgeCache;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function rankKnowledgeEntries(query, entries, maxResults = 5) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const queryTokenSet = new Set(queryTokens);

  return entries
    .map((entry) => {
      const contentTokens = tokenize(`${entry.title} ${entry.content}`);
      const contentTokenSet = new Set(contentTokens);
      let score = 0;

      for (const token of queryTokenSet) {
        if (contentTokenSet.has(token)) {
          score += 1;
        }
      }

      for (const tag of entry.tags) {
        if (queryTokenSet.has(tag)) {
          score += 2;
        }
      }

      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((item) => item.entry);
}

router.post("/", async (req, res) => {
  try {
    const message =
      req.body?.message ?? req.body?.query ?? req.body?.question ?? "";
    const text = String(message).trim();
    if (!text) {
      return res.status(400).json({ error: "message is required" });
    }

    if (!getGoogleApiKey()) {
      return res.status(500).json({ error: "Missing Google API key" });
    }

    const knowledgeEntries = await loadKnowledgeBase();
    const matchedEntries = rankKnowledgeEntries(text, knowledgeEntries, 5);

    const context = matchedEntries
      .map(
        (entry) =>
          `Title: ${entry.title}\nTags: ${entry.tags.join(", ")}\nContent: ${entry.content}`,
      )
      .join("\n\n---\n\n");

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: getGoogleApiKey(),
      temperature: 0.2,
    });

    const systemRule =
      "Answer ONLY from the Context below. If the Context does not contain enough information to answer, reply exactly: Mujhe iska jawab nahi pata. Do not guess. Do not use outside knowledge. Keep the answer concise and student-friendly.";

    const prompt = `${systemRule}\n\nContext:\n${context || "(empty)"}\n\nUser question:\n${text}`;

    const result = await model.invoke([new HumanMessage(prompt)]);
    const answer =
      typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content.map((c) => (typeof c === "string" ? c : "")).join("")
          : String(result.content ?? "");

    return res.json({ answer: answer.trim() });
  } catch (err) {
    console.error("[RAG chat]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
