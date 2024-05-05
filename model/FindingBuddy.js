const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const FindBuddySchema = new Schema({
    email: {
      type: String,
      required: true,
    },
    author: {
      type: String,
      required: true,
    },
    authorSocketId: {
      type: String,
      default: null, // Initialize as null
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    interestedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  });
  

module.exports = mongoose.model("FindingBuddy", FindBuddySchema);
