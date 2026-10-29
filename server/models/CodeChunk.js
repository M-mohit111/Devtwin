import mongoose from 'mongoose';

const codeChunkSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    chunkContent: {
      type: String,
      required: true,
    },
    chunkIndex: {
      type: Number,
      default: 0,
    },
    // The mathematical representation: an array of 768 floating point numbers
    embedding: {
      type: [Number],
      required: true,
    },
  },
  { timestamps: true }
);

// Indexes for fast querying per user and per project
codeChunkSchema.index({ user: 1, project: 1 });
codeChunkSchema.index({ project: 1 });

const CodeChunk = mongoose.model('CodeChunk', codeChunkSchema);
export default CodeChunk;
