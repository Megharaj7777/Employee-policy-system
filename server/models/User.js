const mongoose = require("mongoose");

// Define the structure for individual policy responses
const policyResponseSchema = new mongoose.Schema({
  policyKey: {
    type: String,
    required: true,
    enum: [
      "code_of_conduct",
      "remote_work",
      "data_privacy",
      "travel_expense",
      "anti_harassment",
      "workplace_safety"
    ]
  },
  status: {
    type: String,
    enum: ["agreed", "disagreed"],
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: [true, "Name is required"], 
      trim: true 
    },
    phone: { 
      type: String, 
      required: [true, "Phone number is required"], 
      unique: true, 
      trim: true, 
      index: true 
    },

    // 🔒 Security fields for OTP/Captcha
    verificationId: { 
      type: String, 
      default: null, 
      select: false 
    },

    otpExpiry: { 
      type: Date, 
      default: null, 
      select: false 
    },

    // 📊 New: Multi-Policy Tracking
    // This replaces the old 'policyStatus' and 'hasSignedPolicy' 
    // to track every policy individually for the Admin Dashboard.
    policySubmissions: [policyResponseSchema],

    // Global tracking for legacy support or quick dashboard checks
    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  { 
    timestamps: true,
    // Ensure virtuals are included when converting to JSON (useful for frontend)
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual property to quickly check if a user has signed ANY policy
userSchema.virtual("hasSignedAny").get(function () {
  return this.policySubmissions.length > 0;
});

module.exports = mongoose.model("User", userSchema);