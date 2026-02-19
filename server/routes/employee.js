const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const sanitizePhone = (phone) => {
  return phone.replace(/\D/g, "").slice(-10);
};

// =========================
// 🔹 SEND OTP
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    phone = sanitizePhone(phone);
    // Include otp fields explicitly
    const user = await User.findOne({ phone }).select("+otp +otpExpiry +otpCount +otpLastSentDate");

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

    // MessageCentral API Call
    const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&flowType=SMS&mobileNumber=${phone}`;

    const response = await axios.post(url, {}, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    // CRITICAL: Check the exact structure of response.data
    const verificationId = response.data?.data?.verificationId || response.data?.verificationId;

    if (!verificationId) {
      console.error("API Response Missing ID:", response.data);
      return res.status(500).json({ message: "OTP provider failed to return ID" });
    }

    // Update User using findOneAndUpdate to bypass potential model 'select: false' issues during save
    await User.findOneAndUpdate(
      { phone },
      {
        $set: {
          otp: verificationId, // Saving the verificationId here
          otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
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
    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone and OTP required" });
    }

    phone = sanitizePhone(phone);
    // Force selection of otp and otpExpiry
    const user = await User.findOne({ phone }).select("+otp +otpExpiry");

    if (!user || !user.otp) {
      return res.status(400).json({ message: "No OTP request found for this number" });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // MessageCentral Validation API
    const url = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${phone}&verificationId=${user.otp}&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&code=${otp}`;

    const response = await axios.get(url, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    // Check for success: MessageCentral uses responseCode 200 and verificationStatus "VERIFIED"
    const isVerified = response.data?.responseCode === 200 && 
                       (response.data?.data?.verificationStatus === "VERIFIED" || response.data?.verificationStatus === "VERIFIED");

    if (!isVerified) {
      return res.status(400).json({ 
        message: "Invalid OTP", 
        details: response.data?.data?.verificationStatus || "Failed" 
      });
    }

    // Clear the OTP fields after successful login
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ message: "Login Successful", token });

  } catch (err) {
    console.error("VERIFY ERROR:", err.response?.data || err.message);
    res.status(400).json({ message: "OTP verification failed on server" });
  }
});

module.exports = router;