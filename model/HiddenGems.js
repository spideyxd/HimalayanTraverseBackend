const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const hiddenGemSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  imageFile: {
    type: String, // Assuming you save the image file name or path
   
  },
  imgSrc: {
    type: String, // Assuming you save the image link
    required: true,
  },
  likeCount: {
    type: Number,
    default: 0,
  },
  dislikeCount: {
    type: Number,
    default: 0,
  },
  likedBy: [
    {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  dislikedBy: [
    {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  postedBy: {
    type: String,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("HiddenGem", hiddenGemSchema);
