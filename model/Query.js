const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const querySchema = new Schema({
  email: {
    type: String,
    required: true,
  },
  author: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  comments: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      comment: {
        type: String,
        required: true,
      },
      author: {
        type: String,
        required: true,
      },
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Query", querySchema);
