const mongoose = require("mongoose");

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

    // 🔒 Stores the 4-digit Captcha/OTP Code
    // 'select: false' ensures this is hidden from normal queries for security
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

    otpCount: { 
      type: Number, 
      default: 0 
    },
    
    otpLastSentDate: { 
      type: Date, 
      default: null 
    },

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
  { timestamps: true } // Automatically creates 'createdAt' and 'updatedAt'
);

module.exports = mongoose.model("User", userSchema);