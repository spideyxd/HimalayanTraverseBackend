const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    default: 'N/A',
  },
  address: {
    type: String,
    default: 'N/A',
  },
  email: {
    type: String,
    required: true,
  },
  sex: {
    type: String,
    default: 'N/A',
  },
  age: {
    type: Number,
    default: 0,
  },
  bio: {
    type: String,
    default: 'N/A',
  },
  profilePicture: {
    type: Buffer,
    default: Buffer.from(''),
  },
  experienceLevel: {
    type: String,
    default: 'N/A',
  },
  medicalHistory: [
    {
      type: String,
      default: 'N/A',
    },
  ],
  pastTreks: [
    {
      type: String,
      default: 'N/A',
    },
  ],
  tokens: [
    {
      token: {
        type: String,
        required: true,
      },
    },
  ],
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
