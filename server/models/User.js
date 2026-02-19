const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    phone: { type: String, required: [true, "Phone number is required"], unique: true, trim: true, index: true },

    // 🔹 FIXED FIELD NAME TO MATCH ROUTE
    verificationId: { 
      type: String, 
      default: null, 
      select: false // 🔒 Hidden by default for security
    },

    otpExpiry: { 
      type: Date, 
      default: null, 
      select: false 
    },

    otpCount: { type: Number, default: 0 },
    otpLastSentDate: { type: Date, default: null },
    policyStatus: { type: String, enum: ["pending", "agreed", "disagreed"], default: "pending" },
    hasSignedPolicy: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);