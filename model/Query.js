const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const querySchema = new Schema({
    email: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    comments: [
      {
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
  });
  

module.exports = mongoose.model("Query", querySchema);
