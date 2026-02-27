const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("+name +policyStatus +hasSignedPolicy");
    if (!req.user) return res.status(401).json({ message: "User not found" });
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// 1️⃣ SEND OTP + GENERATE CAPTCHA
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone });
    if (!user) return res.status(404).json({ message: "Employee not found" });

    // Generate Captcha for the screen
    const captchaCode = Math.floor(1000 + Math.random() * 9000).toString();

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
      // 🔑 CRITICAL: This is the Session ID Message Central needs later
      const mcVerificationId = response.data.data.verificationId;

      await User.findOneAndUpdate(
        { phone: cleanPhone },
        {
          $set: {
            verificationId: mcVerificationId, // Save the SESSION ID
            screenCaptcha: captchaCode,      // Save our local captcha
            otpExpiry: new Date(Date.now() + 5 * 60 * 1000)
          }
        }
      );

      res.json({ message: "OTP Sent", captcha: captchaCode });
    } else {
      res.status(400).json({ message: "Gateway error" });
    }
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2️⃣ VERIFY BOTH
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp, captcha } = req.body;
    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone }).select("+verificationId +screenCaptcha +otpExpiry");

    if (!user) return res.status(400).json({ message: "User not found" });

    // 🚀 Check our local Captcha first
    if (user.screenCaptcha !== captcha.toString()) {
      return res.status(400).json({ message: "Invalid Captcha code from screen" });
    }

    if (new Date() > user.otpExpiry) return res.status(400).json({ message: "Session expired" });

    // 🚀 Verify SMS OTP with Message Central using the saved Session ID
    try {
      const verifyRes = await axios({
        method: 'get',
        url: 'https://cpaas.messagecentral.com/verification/v3/validate',
        params: {
          countryCode: '91',
          mobileNumber: cleanPhone,
          verificationCode: otp,            // The 4 digits from SMS
          verificationId: user.verificationId, // The Session ID we stored
          customerId: process.env.MC_CUSTOMER_ID
        },
        headers: { 'authToken': process.env.MC_AUTH_TOKEN }
      });

      if (verifyRes.data.responseCode === 200) {
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

module.exports = router;