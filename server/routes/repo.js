import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import Project from '../models/Project.js';
import { ingestRepository } from '../services/githubService.js';

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

export default router;
