const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  otp: String,
  otpExpiry: Number,

  otpCount: {
    type: Number,
    default: 0
  },
  otpLastSentDate: Date,

  policyStatus: {
    type: String,
    enum: ["pending", "agreed", "disagreed"],
    default: "pending"
  }

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
