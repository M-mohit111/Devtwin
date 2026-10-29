/**
 * Service to interact with Google Gemini Embedding API and compute vector similarity.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001';

/**
 * Generate a vector embedding for a single text string using Gemini gemini-embedding-001.
 */
export async function getEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
  }

  const response = await fetch(`${GEMINI_API_URL}:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: {
        parts: [{ text }],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

/**
 * Generate embeddings in bulk (up to 50 chunks per batch) using Gemini batchEmbedContents.
 */
export async function getBatchEmbeddings(texts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
  }

  if (!texts || texts.length === 0) return [];

  const BATCH_SIZE = 30;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const requests = batch.map((text) => ({
      model: 'models/gemini-embedding-001',
      content: {
        parts: [{ text }],
      },
    }));

    const response = await fetch(`${GEMINI_API_URL}:batchEmbedContents?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Batch Embedding Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const batchResults = (data.embeddings || []).map((e) => e.values);
    allEmbeddings.push(...batchResults);
  }

  return allEmbeddings;
}

/**
 * Computes Cosine Similarity between two numeric vectors.
 * Returns a value between -1.0 and 1.0 (higher = more similar).
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Finds the top K most relevant chunks for a given query vector.
 */
export function rankChunksBySimilarity(queryEmbedding, chunks, topK = 4) {
  const scored = chunks.map((chunk) => {
    // Handle both mongoose doc and plain object
    const plainChunk = typeof chunk.toObject === 'function' ? chunk.toObject() : chunk;
    return {
      ...plainChunk,
      similarity: cosineSimilarity(queryEmbedding, plainChunk.embedding),
    };
  });

  // Sort descending by similarity score
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK);
}
