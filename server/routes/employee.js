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
// 1️⃣ SEND OTP (Mobile SMS) + GENERATE CAPTCHA (For DB)
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone }).select("+otpCount +otpLastSentDate");
    
    if (!user) return res.status(404).json({ message: "Employee not found in DB" });

    // 🚀 1. Generate a SEPARATE 4-digit Captcha for the screen
    const captchaCode = Math.floor(1000 + Math.random() * 9000).toString();

    // 🚀 2. Call Message Central for the Mobile OTP
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
        headers: { 'authToken': process.env.MC_AUTH_TOKEN }
      });

      if (response.data.responseCode === 200) {
        // ✅ 3. Store the CAPTCHA code in verificationId (not the SMS OTP)
        await User.findOneAndUpdate(
          { phone: cleanPhone },
          {
            $set: {
              verificationId: captchaCode, 
              otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
              otpLastSentDate: new Date(),
            },
            $inc: { otpCount: 1 }
          }
        );

        console.log(`✅ SMS sent. Captcha stored in DB for ${cleanPhone}: ${captchaCode}`);

        // ✅ 4. Send the captcha to frontend to display on screen
        res.json({ 
          message: "OTP sent to mobile. Please enter it along with the captcha.", 
          captcha: captchaCode 
        });
      } else {
        res.status(400).json({ message: "SMS Gateway error" });
      }
    } catch (apiErr) {
      res.status(500).json({ message: "Failed to send SMS" });
    }
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// =========================
// 2️⃣ VERIFY BOTH (SMS OTP + CAPTCHA)
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp, captcha } = req.body; // Expects both from frontend
    const cleanPhone = sanitizePhone(phone);

    // 🚀 1. Verify CAPTCHA against Database
    const user = await User.findOne({ phone: cleanPhone }).select("+verificationId +otpExpiry");
    
    if (!user || user.verificationId !== captcha.toString()) {
      return res.status(400).json({ message: "Invalid Captcha code from screen" });
    }

    if (new Date() > user.otpExpiry) return res.status(400).json({ message: "Captcha expired" });

    // 🚀 2. Verify SMS OTP against Message Central API
    try {
      const verifyRes = await axios({
        method: 'get',
        url: 'https://cpaas.messagecentral.com/verification/v3/validate',
        params: {
          countryCode: '91',
          mobileNumber: cleanPhone,
          verificationCode: otp, // The OTP user received on phone
          customerId: process.env.MC_CUSTOMER_ID
        },
        headers: { 'authToken': process.env.MC_AUTH_TOKEN }
      });

      if (verifyRes.data.responseCode === 200) {
        // Success! Clear records and login
        user.verificationId = null;
        user.otpExpiry = null;
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
        res.json({ message: "Login Successful", token });
      } else {
        res.status(400).json({ message: "Invalid SMS OTP" });
      }
    } catch (err) {
      res.status(500).json({ message: "Verification service failed" });
    }
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