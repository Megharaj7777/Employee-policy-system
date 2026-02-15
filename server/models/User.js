const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    otp: { type: String, default: null },
    otpExpiry: { type: Date, default: null },
    otpCount: { type: Number, default: 0 },
    otpLimitDate: { type: Date, default: null },
    hasSignedPolicy: { type: Boolean, default: false } // <-- use this instead of policyStatus
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
