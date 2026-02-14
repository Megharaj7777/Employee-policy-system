const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  otp: {
    type: String,
    default: null
  },
  otpExpiry: {
    type: Number,
    default: null
  },
  hasSignedPolicy: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
