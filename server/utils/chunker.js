/**
 * Splits a code file into overlapping chunks suitable for embedding models.
 * 
 * @param {string} content - Full raw code text
 * @param {string} filePath - Path of the file (e.g., 'server/routes/auth.js')
 * @param {number} maxLines - Max lines per chunk (default: 60)
 * @param {number} overlapLines - Overlap lines between consecutive chunks (default: 15)
 * @returns {Array<{ chunkContent: string, chunkIndex: number }>}
 */
export function chunkCodeFile(content, filePath, maxLines = 60, overlapLines = 15) {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');

  // If the file is already small enough, keep it as 1 single chunk
  if (lines.length <= maxLines) {
    return [
      {
        chunkContent: `// File: ${filePath}\n\n${content}`,
        chunkIndex: 0,
      },
    ];
  }

  const chunks = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < lines.length) {
    const endIndex = Math.min(startIndex + maxLines, lines.length);
    const chunkLines = lines.slice(startIndex, endIndex);

    const chunkBody = chunkLines.join('\n');
    const chunkWithHeader = `// File: ${filePath} (Lines ${startIndex + 1}-${endIndex})\n\n${chunkBody}`;

    chunks.push({
      chunkContent: chunkWithHeader,
      chunkIndex,
    });

    chunkIndex++;

    // If we've reached the end of the file, stop
    if (endIndex >= lines.length) break;

    // Advance by (maxLines - overlapLines) to create smooth context overlap
    startIndex += maxLines - overlapLines;
  }

  return chunks;
}
