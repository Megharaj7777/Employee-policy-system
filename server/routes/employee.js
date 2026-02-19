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
// 🔹 SEND OTP (Fast2SMS WhatsApp POST Method)
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone }).select("+otpCount +otpLastSentDate");
    
    if (!user) {
      return res.status(404).json({ message: "Employee not found in database" });
    }

    // Rate Limiting
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 10) {
      return res.status(429).json({ message: "Daily OTP limit reached" });
    }

    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const fullPhone = `91${cleanPhone}`;

    console.log(`Sending WhatsApp OTP: ${generatedOtp} to ${fullPhone}`);

    // 🔥 SWITCHED TO POST FOR BETTER VALIDATION
    // Note: 'variables_values' usually takes a string. 
    // If your template has TWO variables, use: `User,${generatedOtp}`
    const response = await axios({
      method: 'post',
      url: 'https://www.fast2sms.com/dev/whatsapp',
      headers: {
        'authorization': process.env.FAST2SMS_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        "route": "otp",
        "message_id": "13274",
        "phone_number_id": "1052434897942096",
        "numbers": fullPhone,
        "variables_values": generatedOtp 
      }
    });

    if (response.data.return === true) {
      await User.findOneAndUpdate(
        { phone: cleanPhone },
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
      res.status(400).json({ message: response.data.message || "Template mismatch error" });
    }

  } catch (err) {
    // This will help you see if it's an Auth error or Data error in Render
    console.error("WHATSAPP POST ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "WhatsApp gateway connection error" });
  }
});

// =========================
// 🔹 VERIFY OTP (Manual DB Verification)
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    const cleanPhone = sanitizePhone(phone);
    
    // Explicitly select hidden fields to compare with user input
    const user = await User.findOne({ phone: cleanPhone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "No active session. Request new OTP." });
    }

    // Check if OTP is still within the 5-minute window
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Direct comparison: Database Secret vs. User Input
    if (user.verificationId === otp.toString()) {
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