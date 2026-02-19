const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

// =========================
// 🔹 SEND OTP (Fast2SMS WhatsApp API)
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

    // Rate Limiting Logic
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 10) {
      return res.status(429).json({ message: "Daily OTP limit reached" });
    }

    // 1. Generate 4-digit OTP
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`Sending WhatsApp OTP: ${generatedOtp} to ${phone}`);

    // 2. Fast2SMS WhatsApp API URL
    const fast2smsUrl = `https://www.fast2sms.com/dev/whatsapp?authorization=${process.env.FAST2SMS_KEY}&variables_values=${generatedOtp}&route=otp&numbers=${phone}`;

    const response = await axios.get(fast2smsUrl);

    if (response.data.return === true) {
      // 3. Save to DB for manual verification
      await User.findOneAndUpdate(
        { phone },
        {
          $set: {
            verificationId: generatedOtp, 
            otpExpiry: new Date(Date.now() + 5 * 60 * 1000), 
            otpLastSentDate: new Date(),
          },
          $inc: { otpCount: 1 }
        }
      );
      res.json({ message: "WhatsApp OTP sent successfully" });
    } else {
      console.error("Fast2SMS Rejection:", response.data);
      res.status(400).json({ message: response.data.message || "WhatsApp gateway rejected" });
    }

  } catch (err) {
    console.error("WHATSAPP SEND ERROR:", err.message);
    res.status(500).json({ message: "WhatsApp gateway connection error" });
  }
});

// =========================
// 🔹 VERIFY OTP
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    phone = sanitizePhone(phone);

    const user = await User.findOne({ phone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "No active session. Request new OTP." });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Manual Comparison
    if (user.verificationId === otp.toString()) {
      // Success: Clear OTP fields
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
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;