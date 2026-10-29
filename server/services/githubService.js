import Project from '../models/Project.js';
import CodeFile from '../models/CodeFile.js';
import CodeChunk from '../models/CodeChunk.js';
import { chunkCodeFile } from '../utils/chunker.js';
import { getBatchEmbeddings } from './geminiService.js';

// List of folders and files to strictly ignore
const IGNORED_PATHS = [
  'node_modules',
  '.git',
  '.github',
  'dist',
  'build',
  '.next',
  '.vite',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.min.js',
  '.min.css',
  'coverage',
];

// List of valid code file extensions we want to analyze
const VALID_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.py', '.java', '.cpp', '.c', '.h', '.cs',
  '.go', '.rs', '.php', '.rb',
  '.html', '.css', '.scss',
  '.json', '.md', '.sql', '.sh'
]);

/**
 * Filter Git Tree items to only include meaningful source code files
 */
function shouldIncludeFile(item) {
  // 1. Must be a blob (file), not a tree (directory)
  if (item.type !== 'blob') return false;

  // 2. Ignore noise folders & lockfiles
  const isIgnored = IGNORED_PATHS.some((ignored) => item.path.includes(ignored));
  if (isIgnored) return false;

  // 3. Skip large files (> 60 KB) to prevent minified bundles / large assets
  if (item.size && item.size > 60 * 1024) return false;

  // 4. Must have a valid code file extension
  const dotIndex = item.path.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = item.path.substring(dotIndex).toLowerCase();

  return VALID_EXTENSIONS.has(ext);
}

/**
 * Ingests a single repository:
 * 1. Fetches file tree via GitHub API
 * 2. Filters clean source files
 * 3. Downloads file contents (up to 30 files)
 * 4. Stores them in CodeFile collection and marks Project as completed
 */
export async function ingestRepository(user, project) {
  const headers = {
    'User-Agent': 'DevTwin-App',
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${user.accessToken}`,
  };

  try {
    // Step A: Update status to 'analyzing'
    project.status = 'analyzing';
    await project.save();

    // Step B: Fetch the complete Git Tree using 'HEAD' (targets default branch like main/master)
    const treeUrl = `https://api.github.com/repos/${user.username}/${project.name}/git/trees/HEAD?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers });

    if (!treeRes.ok) {
      throw new Error(`GitHub Trees API returned ${treeRes.status}`);
    }

    const treeData = await treeRes.json();
    const allFiles = treeData.tree || [];

    // Step C: Filter only clean source code files
    const validFiles = allFiles.filter(shouldIncludeFile).slice(0, 30); // Cap at 30 most important files

    // Step D: Clean out any previous files for this project (in case of re-import)
    await CodeFile.deleteMany({ project: project._id });

    let savedFilesCount = 0;
    let readmeText = '';

    // Step E: Fetch the raw content for each file
    for (const file of validFiles) {
      try {
        const contentUrl = `https://api.github.com/repos/${user.username}/${project.name}/contents/${file.path}`;
        const contentRes = await fetch(contentUrl, { headers });

        if (contentRes.ok) {
          const contentData = await contentRes.json();
          // GitHub returns content encoded in base64
          const rawCode = Buffer.from(contentData.content, 'base64').toString('utf-8');

          const dotIndex = file.path.lastIndexOf('.');
          const ext = dotIndex !== -1 ? file.path.substring(dotIndex).toLowerCase() : '';

          // Save to CodeFile collection
          await CodeFile.create({
            project: project._id,
            user: user._id,
            path: file.path,
            content: rawCode,
            size: file.size || rawCode.length,
            extension: ext,
          });

          savedFilesCount++;

          // Check if this is the README
          if (file.path.toLowerCase() === 'readme.md') {
            readmeText = rawCode;
          }
        }
      } catch (err) {
        console.error(`Error fetching file ${file.path}:`, err.message);
      }
    }

    // Step F: Generate Vector Embeddings for all saved code files
    const chunksCount = await generateProjectEmbeddings(project);

    // Step G: Mark project as completed!
    project.status = 'completed';
    project.filesCount = savedFilesCount;
    project.chunksCount = chunksCount;
    project.readme = readmeText;
    await project.save();

    console.log(`✅ Finished ingesting & embedding ${project.name}: ${savedFilesCount} files, ${chunksCount} vector chunks saved.`);
  } catch (error) {
    console.error(`❌ Ingestion failed for ${project.name}:`, error.message);
    project.status = 'failed';
    await project.save();
  }
}

/**
 * Chunks all code files of a project and generates vector embeddings.
 */
export async function generateProjectEmbeddings(project) {
  try {
    const files = await CodeFile.find({ project: project._id });
    if (!files || files.length === 0) return 0;

    // Collect all chunks across all files
    const allChunks = [];
    for (const file of files) {
      const fileChunks = chunkCodeFile(file.content, file.path);
      for (const fc of fileChunks) {
        allChunks.push({
          project: project._id,
          user: project.user,
          filePath: file.path,
          chunkContent: fc.chunkContent,
          chunkIndex: fc.chunkIndex,
        });
      }
    }

    if (allChunks.length === 0) return 0;

    console.log(`🧠 Generating vector embeddings for ${allChunks.length} chunks from ${project.name}...`);

    // Extract raw text for embedding
    const chunkTexts = allChunks.map((c) => c.chunkContent);
    const embeddings = await getBatchEmbeddings(chunkTexts);

    // Attach embedding vectors to chunk objects
    for (let i = 0; i < allChunks.length; i++) {
      allChunks[i].embedding = embeddings[i] || [];
    }

    // Clean old chunks for this project
    await CodeChunk.deleteMany({ project: project._id });

    // Bulk insert new chunks
    await CodeChunk.insertMany(allChunks);

    console.log(`✨ Successfully generated and stored ${allChunks.length} vector embeddings!`);
    return allChunks.length;
  } catch (err) {
    console.error(`Error generating embeddings for ${project.name}:`, err.message);
    return 0;
  }
}
