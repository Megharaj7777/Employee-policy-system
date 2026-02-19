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
// 🔹 SEND OTP
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    phone = sanitizePhone(phone);
    
    // Explicitly select hidden security fields
    const user = await User.findOne({ phone }).select("+otpCount +otpLastSentDate");

    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Reset daily limit logic
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }

    if (user.otpCount >= 3) {
      return res.status(429).json({ message: "OTP limit reached for today" });
    }

    // MessageCentral API Call (V3 Send)
    const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&flowType=SMS&mobileNumber=${phone}`;

    const response = await axios.post(url, {}, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    const vId = response.data?.data?.verificationId || response.data?.verificationId;

    if (!vId) {
      return res.status(500).json({ message: "OTP provider failed to return ID" });
    }

    // Save the verificationId to match your User Schema
    await User.findOneAndUpdate(
      { phone },
      {
        $set: {
          verificationId: vId, 
          otpExpiry: new Date(Date.now() + 5 * 60 * 1000), // 5 minute expiry
          otpLastSentDate: new Date(),
        },
        $inc: { otpCount: 1 }
      }
    );

    res.json({ message: "OTP sent successfully" });

  } catch (err) {
    console.error("SEND ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "SMS gateway error" });
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

    // Get user and explicitly select the hidden verificationId
    const user = await User.findOne({ phone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "OTP not requested or session expired" });
    }

    // Build the V3 Validate URL with verificationId AND code
    const url = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${phone}&verificationId=${user.verificationId}&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&code=${otp}`;

    const response = await axios.get(url, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    // Check if verification was successful
    const isVerified = response.data.responseCode === 200 && 
                       (response.data.data?.verificationStatus === "VERIFIED" || response.data.verificationStatus === "VERIFIED");

    if (isVerified) {
      // Clear OTP session data after successful login
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
      return res.status(400).json({ 
        message: "Invalid OTP", 
        error_details: response.data.data?.verificationStatus || "FAILED" 
      });
    }

  } catch (err) {
    console.error("VERIFY ERROR:", err.response?.data || err.message);
    res.status(400).json({ message: "OTP verification failed" });
  }
});

module.exports = router;