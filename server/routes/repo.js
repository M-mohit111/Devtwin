import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Project from '../models/Project.js';
import CodeChunk from '../models/CodeChunk.js';
import { ingestRepository, generateProjectEmbeddings } from '../services/githubService.js';
import { getEmbedding, rankChunksBySimilarity } from '../services/geminiService.js';

const router = express.Router();

// Route: GET /api/repos/github
// Purpose: Fetch the logged-in user's repositories from GitHub
router.get('/github', protect, async (req, res) => {
  try {
    const headers = {
      'User-Agent': 'DevTwin-App',
      'Accept': 'application/vnd.github.v3+json',
    };

    if (req.user.accessToken) {
      headers['Authorization'] = `Bearer ${req.user.accessToken}`;
    }

    // If we have the user's GitHub token, call /user/repos with 5,000 req/hr rate limit
    // Otherwise fallback to public endpoint
    const url = req.user.accessToken
      ? 'https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner'
      : `https://api.github.com/users/${req.user.username}/repos?type=public&sort=updated&per_page=100`;

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API error (${response.status}):`, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch repositories from GitHub',
        needsReauth: !req.user.accessToken 
      });
    }

    const repos = await response.json();

    // Filter out forks if desired, or map relevant fields
    const cleanedRepos = repos.map((repo) => ({
      githubRepoId: repo.id,
      name: repo.name,
      description: repo.description || 'No description provided.',
      language: repo.language,
      stars: repo.stargazers_count,
      htmlUrl: repo.html_url,
    }));

    res.status(200).json(cleanedRepos);

  } catch (error) {
    console.error('Error fetching repos:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Route: GET /api/repos/imported
// Purpose: Fetch all projects the user has already imported into DevTwin
router.get('/imported', protect, async (req, res) => {
  try {
    const projects = await Project.find({ user: req.user._id }).sort({ updatedAt: -1 });
    res.status(200).json(projects);
  } catch (error) {
    console.error('Error fetching imported projects:', error);
    res.status(500).json({ error: 'Failed to fetch imported projects' });
  }
});

// Route: POST /api/repos/import
// Purpose: Import selected repositories and trigger code ingestion
router.post('/import', protect, async (req, res) => {
  const { repos } = req.body;

  if (!repos || !Array.isArray(repos) || repos.length === 0) {
    return res.status(400).json({ error: 'Please provide an array of repositories to import' });
  }

  try {
    const importedProjects = [];

    for (const repo of repos) {
      // Find or create project record in MongoDB
      const project = await Project.findOneAndUpdate(
        { user: req.user._id, githubRepoId: repo.githubRepoId },
        {
          user: req.user._id,
          githubRepoId: repo.githubRepoId,
          name: repo.name,
          description: repo.description || '',
          htmlUrl: repo.htmlUrl,
          language: repo.language,
          status: 'pending',
        },
        { upsert: true, new: true }
      );

      importedProjects.push(project);

      // Trigger ingestion asynchronously in background (won't block the HTTP response)
      ingestRepository(req.user, project).catch((err) => {
        console.error(`Background ingestion error for ${repo.name}:`, err);
      });
    }

    res.status(200).json({
      message: `Started importing ${importedProjects.length} repositories`,
      projects: importedProjects,
    });
  } catch (error) {
    console.error('Error importing repositories:', error);
    res.status(500).json({ error: 'Failed to import repositories' });
  }
});

// Route: POST /api/repos/:projectId/embed
// Purpose: Manually generate vector embeddings for a previously imported project
router.post('/:projectId/embed', protect, async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const count = await generateProjectEmbeddings(project);
    project.chunksCount = count;
    await project.save();

    res.status(200).json({ message: `Successfully generated ${count} vector embeddings`, chunksCount: count });
  } catch (error) {
    console.error('Embedding error:', error);
    res.status(500).json({ error: 'Failed to generate embeddings' });
  }
});

// Route: POST /api/repos/search
// Purpose: Semantic code search using vector similarity
router.post('/search', protect, async (req, res) => {
  const { query, projectId } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Please provide a search query' });
  }

  try {
    // Step 1: Turn user query into a vector
    const queryVector = await getEmbedding(query);

    // Step 2: Fetch all stored code chunks for this user (or specific project)
    const filter = { user: req.user._id };
    if (projectId) filter.project = projectId;

    const chunks = await CodeChunk.find(filter).populate('project', 'name language');

    if (chunks.length === 0) {
      return res.status(200).json({
        message: 'No embedded code chunks found. Try generating embeddings first!',
        results: [],
      });
    }

    // Step 3: Rank chunks using Cosine Similarity
    const ranked = rankChunksBySimilarity(queryVector, chunks, 4);

    // Step 4: Return clean response without huge embedding arrays
    const cleanResults = ranked.map((r) => ({
      projectId: r.project?._id,
      projectName: r.project?.name,
      filePath: r.filePath,
      chunkContent: r.chunkContent,
      similarity: (r.similarity * 100).toFixed(1) + '%',
    }));

    res.status(200).json({
      query,
      resultsCount: cleanResults.length,
      results: cleanResults,
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ error: 'Semantic search failed' });
  }
});

export default router;
