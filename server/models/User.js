const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    phone: { 
      type: String, 
      required: [true, "Phone number is required"], 
      unique: true, 
      trim: true, 
      index: true 
    },

    // 🔹 This will store your manually generated 4-digit OTP
    verificationId: { 
      type: String, 
      default: null, 
      select: false // 🔒 Keeps it hidden from common GET requests
    },

    otpExpiry: { 
      type: Date, 
      default: null, 
      select: false 
    },

    // 🔹 Tracking for rate-limiting
    otpCount: { type: Number, default: 0 },
    otpLastSentDate: { type: Date, default: null },

    // 🔹 Policy management
    policyStatus: { 
      type: String, 
      enum: ["pending", "agreed", "disagreed"], 
      default: "pending" 
    },
    hasSignedPolicy: { type: Boolean, default: false }
  },
  { timestamps: true } // Adds createdAt and updatedAt automatically
);

module.exports = mongoose.model("User", userSchema);