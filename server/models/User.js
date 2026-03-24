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
      "workplace_safety",
      "banding",     
      "holidays",    
      "leaves"
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
    // 🆔 New: Employee ID Field
    employeeId: {
      type: String,
      trim: true,
      index: true, // Speeds up admin searches
      default: ""
    },
    
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

    // 📊 Multi-Policy Tracking
    policySubmissions: [policyResponseSchema],

    // Global tracking
    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual property to quickly check if a user has signed ANY policy
userSchema.virtual("hasSignedAny").get(function () {
  return this.policySubmissions.length > 0;
});

module.exports = mongoose.model("User", userSchema);