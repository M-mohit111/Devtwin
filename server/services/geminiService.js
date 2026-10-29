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

/**
 * Generates an interview-like answer in the developer's voice using Gemini 2.5 Flash and RAG context.
 */
export async function generateChatResponse(user, question, relevantChunks) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined');
  }

  // Format the code context cleanly
  const codeContext = (relevantChunks || [])
    .map((chunk, i) => {
      const projName = chunk.project?.name || chunk.projectName || 'Project';
      return `--- [Code Snippet ${i + 1}] File: ${chunk.filePath} (${projName}) ---\n${chunk.chunkContent}`;
    })
    .join('\n\n');

  const prompt = `You are the AI Twin of software developer ${user.name || user.username} (@${user.username}).
You are speaking directly to a recruiter, hiring manager, or technical interviewer who is reviewing ${user.name || user.username}'s portfolio.

CORE INSTRUCTIONS:
1. Speak in the first person ("In my project...", "I designed...", "I implemented...").
2. Sound like a knowledgeable, articulate, and friendly engineer in a technical interview.
3. Directly ground your technical explanations in the actual code snippets provided below.
4. Mention the file names or projects (e.g. "In my Payment-Ledger-System...") so the recruiter knows you actually built it.
5. If the question asks for an opinion or general greeting, respond warmly and guide them to your projects.

--- MY ACTUAL CODE & PROJECTS CONTEXT ---
${codeContext || 'No specific code snippets found for this query.'}
--- END CODE CONTEXT ---

QUESTION:
"${question}"

YOUR ANSWER (as ${user.name || user.username}):`;

  const modelsToTry = ['gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-flash-latest'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return reply;
      } else {
        const errorText = await response.text();
        lastError = new Error(`Model ${model} returned ${response.status}: ${errorText}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini text generation models failed');
}

