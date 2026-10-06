import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Step 1: The React frontend will send the user to this URL to start the login process
router.get('/github', (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=http://localhost:5000/api/auth/github/callback&scope=read:user user:email`;
  res.redirect(githubAuthUrl);
});

// Step 2: GitHub redirects back to this URL with a temporary 'code'
router.get('/github/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No code provided by GitHub' });
  }

  try {
    // 2a. Exchange the code for an Access Token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      }),
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(400).json({ error: 'Failed to get access token from GitHub' });
    }

    // 2b. Use the Access Token to get the user's GitHub profile data
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const githubUser = await userResponse.json();

    // 2c. Check if user exists in our MongoDB, if not, create them
    let user = await User.findOne({ githubId: githubUser.id.toString() });

    if (!user) {
      user = await User.create({
        githubId: githubUser.id.toString(),
        username: githubUser.login,
        name: githubUser.name || githubUser.login,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
      });
    }

    // 2d. Create our own DevTwin JWT Token so the frontend knows who is logged in
    // Note: We need a JWT_SECRET in our .env file for this!
    const devtwinToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'fallback_secret_for_local_dev', 
      { expiresIn: '7d' }
    );

    // 2e. Redirect back to the React frontend with the token
    res.redirect(`http://localhost:5173/?token=${devtwinToken}`);

  }
  catch (error) {
    console.error('GitHub Auth Error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

import { protect } from '../middleware/authMiddleware.js';

// Step 3: The React frontend uses the token to ask "Who am I?"
router.get('/me', protect, (req, res) => {
  // If the token is valid, the 'protect' middleware adds the user to req.user
  res.status(200).json(req.user);
});

export default router;
