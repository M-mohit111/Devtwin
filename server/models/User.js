import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    githubId: {
      type: String,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
    },
    avatarUrl: {
      type: String,
    },
    bio: {
      type: String,
    },
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt
);

const User = mongoose.model('User', userSchema);
export default User;
