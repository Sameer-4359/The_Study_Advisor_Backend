import "dotenv/config";
import express from "express";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { getVectorStore, getGoogleApiKey } from "../lib/ragClient.mjs";

const router = express.Router();

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

    const vectorStore = await getVectorStore();
    const docs = await vectorStore.similaritySearch(text, 5);
    const context = docs.map((d) => d.pageContent).join("\n\n---\n\n");

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: getGoogleApiKey(),
      temperature: 0.2,
    });

    const systemRule =
      "Answer ONLY from the Context below. If the Context does not contain enough information to answer, reply exactly: Mujhe iska jawab nahi pata. Do not guess. Do not use outside knowledge.";

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
