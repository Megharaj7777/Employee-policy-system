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

    // Rate Limiting Logic
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 10) {
      return res.status(429).json({ message: "Daily OTP limit reached" });
    }

    // 1️⃣ GENERATE OTP & EXPIRY
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const fullPhone = `91${cleanPhone}`;

    // 2️⃣ SAVE TO DATABASE IMMEDIATELY (Crucial Fix)
    // We save first so verificationId is NOT null, even if API fails
    await User.findOneAndUpdate(
      { phone: cleanPhone },
      {
        $set: {
          verificationId: generatedOtp, 
          otpExpiry: otpExpiry, 
          otpLastSentDate: new Date(),
        },
        $inc: { otpCount: 1 }
      }
    );

    console.log(`✅ OTP ${generatedOtp} saved to DB for ${cleanPhone}. Attempting WhatsApp...`);

    // 3️⃣ TRY SENDING VIA WHATSAPP
    try {
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
        return res.json({ message: "WhatsApp OTP sent successfully" });
      } else {
        console.error("Fast2SMS Rejection:", response.data);
        // Note: OTP is still in DB, so user can check logs to login
        return res.status(200).json({ 
          message: "OTP generated. (WhatsApp delivery failed: " + (response.data.message || "Template Error") + ")" 
        });
      }
    } catch (apiErr) {
      console.error("WHATSAPP API ERROR:", apiErr.response?.data || apiErr.message);
      return res.status(200).json({ message: "OTP generated. Check server logs if WhatsApp not received." });
    }

  } catch (err) {
    console.error("INTERNAL SERVER ERROR:", err.message);
    res.status(500).json({ message: "Internal server error" });
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

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Direct comparison
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