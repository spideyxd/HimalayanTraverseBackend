const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Define message schema
const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  }, 
  name: { type: String, required: true },
  content: { type: String, required: true }, // Message content
  timestamp: { type: Date, default: Date.now }, // Timestamp of when the message was sent
  read: { type: Boolean, default: false }, // Flag to indicate whether the message has been read by the receiver
});

// Define conversation schema
const conversationSchema = new mongoose.Schema({
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: { type: String, required: true },
  messages: [messageSchema], // Array of messages in the conversation
});

// Define user schema
const notificationSchema = new mongoose.Schema({
  id: mongoose.Schema.Types.ObjectId, // Unique ID for the notification
  type: { type: String, required: true },
  name: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
});

const UserSchema = new mongoose.Schema({
  SocketId: {
    type: String,
    default: null, // Initialize as null
  },

  name: { type: String, required: true },
  password: { type: String, required: true },
  phone: { type: String, default: "N/A" },
  address: { type: String, default: "N/A" },
  email: { type: String, required: true },
  sex: { type: String, default: "N/A" },
  age: { type: Number, default: 0 },
  bio: { type: String, default: "N/A" },
  profilePicture: { type: Buffer, default: Buffer.from("") },
  experienceLevel: { type: String, default: "N/A" },
  medicalHistory: [{ type: String, default: "N/A" }],
  pastTreks: [{ type: String, default: "N/A" }],
  tokens: [{ token: { type: String, required: true } }],
  conversations: [conversationSchema], // Array of conversation objects
  notifications: [notificationSchema], // Array of notification objects
});

UserSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// we are generating token
UserSchema.methods.generateAuthToken = async function () {
  try {
    let token = jwt.sign({ _id: this._id }, process.env.REACT_APP_TOKEN);
    this.tokens = this.tokens.concat({ token: token });
    await this.save();
    return token;
  } catch (err) {
    console.log(err);
  }
};

const User = mongoose.model("User", UserSchema); //class bni h
module.exports = User;
