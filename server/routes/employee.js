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

// 🔹 MIDDLEWARE: Protect Routes
const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "No token, access denied" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("+name +policyStatus +hasSignedPolicy");
    
    if (!req.user) return res.status(401).json({ message: "User not found" });
    
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// =========================
// 1️⃣ SEND OTP (SMS + Captcha Hybrid)
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    const cleanPhone = sanitizePhone(phone);
    // Find user and select rate-limiting fields
    const user = await User.findOne({ phone: cleanPhone }).select("+otpCount +otpLastSentDate");
    
    if (!user) return res.status(404).json({ message: "Employee not found in DB" });

    // Rate Limiting Logic
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 10) return res.status(429).json({ message: "Daily limit reached" });

    // 🚀 MESSAGE CENTRAL SMS CALL
    try {
      const response = await axios({
        method: 'post',
        url: 'https://cpaas.messagecentral.com/verification/v3/send',
        params: {
          countryCode: '91',
          customerId: process.env.MC_CUSTOMER_ID,
          flowType: 'SMS', 
          mobileNumber: cleanPhone,
          otpLength: '4'
        },
        headers: {
          'authToken': process.env.MC_AUTH_TOKEN 
        }
      });

      if (response.data.responseCode === 200) {
        const sentOtp = response.data.data.otp;

        // ✅ UPDATE DATABASE: Store the OTP for verification later
        await User.findOneAndUpdate(
          { phone: cleanPhone },
          {
            $set: {
              verificationId: sentOtp, 
              otpExpiry: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
              otpLastSentDate: new Date(),
            },
            $inc: { otpCount: 1 }
          }
        );

        console.log(`✅ [CAPTCHA GENERATED] Phone: ${cleanPhone} | OTP: ${sentOtp}`);

        // ✅ RETURN TO FRONTEND: This allows index.html to show it as a captcha
        res.json({ 
          message: "OTP sent and Captcha generated", 
          captcha: sentOtp 
        });

      } else {
        res.status(400).json({ message: "Gateway error: " + response.data.message });
      }
    } catch (apiErr) {
      console.error("SMS Provider Error:", apiErr.response?.data || apiErr.message);
      res.status(500).json({ message: "Failed to process request" });
    }
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// =========================
// 2️⃣ VERIFY OTP (No changes needed, verifies against DB)
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone }).select("+verificationId +otpExpiry");

    if (!user || user.verificationId !== otp.toString()) {
      return res.status(400).json({ message: "Invalid Code" });
    }

    if (new Date() > user.otpExpiry) return res.status(400).json({ message: "Code expired" });

    user.verificationId = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ message: "Login Successful", token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 3️⃣ PROFILE ROUTE
router.get("/me", protect, (req, res) => res.json({ user: req.user }));

// 4️⃣ SUBMIT POLICY
router.post("/submit-policy", protect, async (req, res) => {
  req.user.policyStatus = req.body.status;
  req.user.hasSignedPolicy = true;
  await req.user.save();
  res.json({ message: "Recorded" });
});

// 5️⃣ ADMIN ROUTE
router.get("/admin/all-responses", async (req, res) => {
  const employees = await User.find({}, "name phone hasSignedPolicy policyStatus");
  res.json(employees);
});

module.exports = router;