import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

export function getGoogleApiKey() {
  return (
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

export function getPineconeIndexName() {
  return process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX;
}

export function getPineconeNamespace() {
  return process.env.PINECONE_NAMESPACE || "";
}

export function getPineconeIndex() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = getPineconeIndexName();

  if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
  if (!indexName) {
    throw new Error("PINECONE_INDEX_NAME or PINECONE_INDEX is not set");
  }
  
  // Debug: log key prefix and index name (without exposing full key)
  console.log(`Pinecone: Using index "${indexName}" with API key prefix "${apiKey.substring(0, 10)}..."`);
  
  const pc = new Pinecone({ apiKey });
  return pc.Index(indexName);
}

export function getEmbeddings() {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    throw new Error(
      "Set GOOGLE_API_KEY, GEMINI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY"
    );
  }
  return new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-2-preview",
    apiKey,
  });
}

export async function getVectorStore() {
  const embeddings = getEmbeddings();
  const pineconeIndex = getPineconeIndex();
  return PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: getPineconeNamespace() || undefined,
    textKey: "text",
  });
}
