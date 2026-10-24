import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    githubRepoId: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    htmlUrl: {
      type: String,
    },
    language: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'analyzing', 'completed', 'failed'],
      default: 'pending',
    },
    filesCount: {
      type: Number,
      default: 0,
    },
    readme: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound Index: Ensures a user cannot import the exact same GitHub repository twice
projectSchema.index({ user: 1, githubRepoId: 1 }, { unique: true });

const Project = mongoose.model('Project', projectSchema);
export default Project;
