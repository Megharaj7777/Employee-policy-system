const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

// 🔹 HELPER: Sanitize Phone Number
const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

// 🔹 MIDDLEWARE: Protect Routes (Prevents Logout Loop in Policy Page)
const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "No token, access denied" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    
    if (!req.user) return res.status(401).json({ message: "User not found" });
    
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// =========================
// 1️⃣ SEND OTP (Payment Template: 13274)
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone }).select("+otpCount +otpLastSentDate");
    
    if (!user) return res.status(404).json({ message: "Employee not found in DB" });

    // Rate Limiting (10 per day)
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 10) return res.status(429).json({ message: "Daily OTP limit reached" });

    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // ✅ SAVE TO DB FIRST (Enables manual login via logs if WhatsApp fails)
    await User.findOneAndUpdate(
      { phone: cleanPhone },
      {
        $set: {
          verificationId: generatedOtp,
          otpExpiry: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
          otpLastSentDate: new Date(),
        },
        $inc: { otpCount: 1 }
      }
    );

    console.log(`✅ [DB UPDATED] OTP for ${cleanPhone}: ${generatedOtp}`);

    // 🚀 WHATSAPP API CALL
    // Template: "Your last payment completed successfully. amount: {{1}}"
    const variableData = `${generatedOtp}.00`; // Decimal formatting is REQUIRED for this template

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
          "numbers": `91${cleanPhone}`,
          "variables_values": variableData 
        }
      });

      if (response.data.return === true) {
        res.json({ message: "WhatsApp OTP sent successfully" });
      } else {
        console.error("Fast2SMS Rejection:", response.data);
        res.status(200).json({ message: "OTP saved. WhatsApp reported: " + response.data.message });
      }
    } catch (apiErr) {
      console.error("WhatsApp Gateway Down:", apiErr.message);
      res.status(200).json({ message: "OTP stored in system. Check logs." });
    }
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// =========================
// 2️⃣ VERIFY OTP
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone }).select("+verificationId +otpExpiry");

    if (!user || user.verificationId !== otp.toString()) {
      return res.status(400).json({ message: "Invalid OTP code" });
    }

    if (new Date() > user.otpExpiry) return res.status(400).json({ message: "OTP has expired" });

    // Login successful - Clear OTP
    user.verificationId = null;
    user.otpExpiry = null;
    await user.save();

    // Generate Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ message: "Login Successful", token });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// =========================
// 3️⃣ GET ME (Required for Policy Page)
// =========================
router.get("/me", protect, async (req, res) => {
  res.json({ user: req.user });
});

// =========================
// 4️⃣ SUBMIT POLICY
// =========================
router.post("/submit-policy", protect, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['agreed', 'disagreed'].includes(status)) return res.status(400).json({ message: "Invalid selection" });

    req.user.policyStatus = status;
    req.user.hasSignedPolicy = true;
    await req.user.save();

    res.json({ message: "Response recorded" });
  } catch (err) {
    res.status(500).json({ message: "Submission failed" });
  }
});

module.exports = router;