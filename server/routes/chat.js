import express from 'express';
import User from '../models/User.js';
import Project from '../models/Project.js';
import CodeChunk from '../models/CodeChunk.js';
import { getEmbedding, rankChunksBySimilarity, generateChatResponse } from '../services/geminiService.js';

const router = express.Router();

/**
 * Route: POST /api/chat/:username
 * Purpose: Ask a question to a developer's AI Twin (Publicly accessible for recruiters!)
 */
router.post('/:username', async (req, res) => {
  const { username } = req.params;
  const { question } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Please provide a question' });
  }

  try {
    // 1. Find the developer
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: `Developer @${username} not found` });
    }

    // 2. Fetch all code chunks for this developer
    const chunks = await CodeChunk.find({ user: user._id }).populate('project', 'name language');

    let relevantChunks = [];

    if (chunks.length > 0) {
      // 3. Convert recruiter question into a vector embedding
      const queryVector = await getEmbedding(question);

      // 4. Find the top 3 most relevant code chunks using Cosine Similarity
      const ranked = rankChunksBySimilarity(queryVector, chunks, 3);

      // Only pass chunks that have meaningful similarity (e.g. > 45%)
      relevantChunks = ranked.filter((r) => r.similarity > 0.45);
    }

    // 5. Ask Gemini 2.5 Flash to generate an interview response grounded in the code
    const answer = await generateChatResponse(user, question, relevantChunks);

    // 6. Return response with code source references
    res.status(200).json({
      answer,
      sources: relevantChunks.map((r) => ({
        filePath: r.filePath,
        projectName: r.project?.name || 'Project',
        similarity: (r.similarity * 100).toFixed(1) + '%',
      })),
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to generate response from AI Twin' });
  }
});

export default router;
