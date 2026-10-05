import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables (like secret keys) from a .env file
dotenv.config();

// Initialize the Express application
const app = express();

// Middleware: CORS allows our React frontend (port 5173) to communicate with this backend without security blocks
app.use(cors());

// Middleware: Allows our backend to understand JSON data sent in requests
app.use(express.json());

// A simple health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'DevTwin API is running smoothly!' });
});

// Define the port (use the one in .env, or default to 5000)
const PORT = process.env.PORT || 5000;

// Start the server and listen for incoming requests
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
