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
// 🔹 SEND OTP (Fast2SMS)
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    phone = sanitizePhone(phone);
    
    const user = await User.findOne({ phone }).select("+otpCount +otpLastSentDate");
    if (!user) {
      return res.status(404).json({ message: "Employee not found in database" });
    }

    // Daily Limit Check
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 10) { // Increased limit for testing
      return res.status(429).json({ message: "Daily OTP limit reached" });
    }

    // 1. Generate a random 4-digit OTP
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // 2. Call Fast2SMS API (OTP Route)
    // Documentation: https://www.fast2sms.com/dev/bulkV2
    const fast2smsUrl = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_KEY}&variables_values=${generatedOtp}&route=otp&numbers=${phone}`;

    const response = await axios.get(fast2smsUrl);

    if (response.data.return === true) {
      // 3. Save generated OTP to YOUR database
      await User.findOneAndUpdate(
        { phone },
        {
          $set: {
            verificationId: generatedOtp, // We use this field to store the actual OTP now
            otpExpiry: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
            otpLastSentDate: new Date(),
          },
          $inc: { otpCount: 1 }
        }
      );
      res.json({ message: "OTP sent successfully via Fast2SMS" });
    } else {
      console.error("Fast2SMS Error:", response.data);
      res.status(500).json({ message: "Failed to send SMS through Fast2SMS" });
    }

  } catch (err) {
    console.error("SEND ERROR:", err.message);
    res.status(500).json({ message: "SMS gateway connection error" });
  }
});

// =========================
// 🔹 VERIFY OTP (Manual DB Check)
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    phone = sanitizePhone(phone);

    // Get user and check our stored OTP (verificationId)
    const user = await User.findOne({ phone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "No active OTP session. Please request a new one." });
    }

    // Check if OTP is expired
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Compare provided OTP with stored OTP
    if (user.verificationId === otp.toString()) {
      // Success: Clear OTP data
      user.verificationId = null;
      user.otpExpiry = null;
      await user.save();

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