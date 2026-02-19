const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    // 🔹 OTP SYSTEM
    otp: {
      type: String,
      default: null
    },

    otpExpiry: {
      type: Number,
      default: null
    },

    otpCount: {
      type: Number,
      default: 0
    },

    otpLastSentDate: {
      type: Date,
      default: null
    },

    // 🔹 POLICY STATUS
    policyStatus: {
      type: String,
      enum: ["pending", "agreed", "disagreed"],
      default: "pending"
    },

    hasSignedPolicy: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);
