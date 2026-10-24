import mongoose from 'mongoose';

const codeFileSchema = new mongoose.Schema(
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
    path: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    extension: {
      type: String,
    },
  },
  { timestamps: true }
);

// Index to quickly look up all files belonging to a specific project
codeFileSchema.index({ project: 1 });

const CodeFile = mongoose.model('CodeFile', codeFileSchema);
export default CodeFile;
