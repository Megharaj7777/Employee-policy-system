const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

// Ensures the phone number is always exactly 10 digits
const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

// =========================
// 🔹 SEND OTP (Fast2SMS - Bulk SMS Route)
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    phone = sanitizePhone(phone);
    
    // Check if user exists in your MongoDB
    const user = await User.findOne({ phone }).select("+otpCount +otpLastSentDate");
    if (!user) {
      return res.status(404).json({ message: "Employee not found in database" });
    }

    // 1. Generate a random 4-digit OTP manually
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // 2. Call Fast2SMS API (Quick SMS Bulk Route)
    // This uses the 'otp' route which is pre-approved and bypasses DLT.
    const fast2smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_KEY}&variables_values=${generatedOtp}&route=otp&numbers=${phone}`;

    const response = await axios.get(fast2smsUrl);

    // Fast2SMS returns a 'return' boolean. True means the gateway accepted it.
    if (response.data.return === true) {
      // 3. Save generated OTP to YOUR database for verification later
      await User.findOneAndUpdate(
        { phone },
        {
          $set: {
            verificationId: generatedOtp, 
            otpExpiry: new Date(Date.now() + 5 * 60 * 1000), // Valid for 5 mins
            otpLastSentDate: new Date(),
          },
          $inc: { otpCount: 1 }
        }
      );
      res.json({ message: "OTP sent successfully via SMS" });
    } else {
      // If Fast2SMS rejects (e.g., low balance or invalid key)
      console.error("Fast2SMS Rejection:", response.data);
      res.status(400).json({ message: response.data.message || "Gateway rejected the request" });
    }

  } catch (err) {
    // This catches network errors or server crashes
    console.error("SEND ERROR:", err.message);
    res.status(500).json({ message: "SMS gateway connection error" });
  }
});

// =========================
// 🔹 VERIFY OTP (Checks against your DB)
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    phone = sanitizePhone(phone);

    // Get user and explicitly select the hidden fields
    const user = await User.findOne({ phone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "No active OTP session. Please request a new one." });
    }

    // Check Expiry
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Compare the user's input with the OTP we saved earlier
    if (user.verificationId === otp.toString()) {
      // SUCCESS: Clear the OTP from DB
      user.verificationId = null;
      user.otpExpiry = null;
      await user.save();

      // Generate the JWT login token
      const token = jwt.sign(
        { id: user._id, role: "employee" },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );

      return res.json({ message: "Login Successful", token });
    } else {
      return res.status(400).json({ message: "Invalid OTP code" });
    }

  } catch (err) {
    console.error("VERIFY ERROR:", err.message);
    res.status(500).json({ message: "Internal server error during verification" });
  }
});

module.exports = router;