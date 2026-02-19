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
      index: true // Ensures fast lookups for login
    },

    // 🔹 OTP SYSTEM (Security hardened)
    otp: {
      type: String,
      default: null,
      select: false // 🔒 OTP won't be returned in standard queries
    },

    otpExpiry: {
      type: Date, // Changed to Date for better Mongoose compatibility
      default: null,
      select: false // 🔒 Expiry won't be returned in standard queries
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
    timestamps: true // Automatically creates createdAt and updatedAt fields
  }
);

// Optional: Transform the JSON output to clean up the object for the frontend
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("User", userSchema);