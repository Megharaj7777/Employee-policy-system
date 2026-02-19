const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");

const sanitizePhone = (phone) => phone.replace(/\D/g, "").slice(-10);

// =========================
// 🔹 SEND OTP
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number required" });

    phone = sanitizePhone(phone);

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "Employee not found. Contact Admin." });
    }

    // 🔹 Daily reset
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }

    if (user.otpCount >= 3) {
      return res.status(429).json({ message: "OTP limit reached (3/3). Try tomorrow." });
    }

    const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID.trim();
    const authToken = process.env.MESSAGECENTRAL_AUTH_TOKEN.trim();

    const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${customerId}&flowType=SMS&mobileNumber=${phone}`;

    const response = await axios.post(url, {}, {
      headers: {
        authToken: authToken
      }
    });

    const verificationId = response.data?.data?.verificationId;

    if (!verificationId) {
      console.error("INVALID RESPONSE:", response.data);
      return res.status(500).json({ message: "Failed to send OTP" });
    }

    // ✅ Save only verificationId (NOT OTP)
    user.otp = verificationId;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    user.otpCount += 1;
    user.otpLastSentDate = new Date();
    await user.save();

    res.json({ message: `OTP Sent (${user.otpCount}/3)` });

  } catch (error) {
    console.error("SEND OTP ERROR:", error.response?.data || error.message);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// =========================
// 🔹 VERIFY OTP (IMPORTANT FIX)
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = sanitizePhone(phone);

    const user = await User.findOne({ phone });
    if (!user || !user.otp) {
      return res.status(400).json({ message: "OTP not requested" });
    }

    const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID.trim();
    const authToken = process.env.MESSAGECENTRAL_AUTH_TOKEN.trim();

    const url = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${phone}&verificationId=${user.otp}&customerId=${customerId}&code=${otp}`;

    const response = await axios.get(url, {
      headers: {
        authToken: authToken
      }
    });

    const status = response.data?.data?.verificationStatus;

    if (status !== "VERIFIED") {
      return res.status(400).json({ message: "Invalid or Expired OTP" });
    }

    // ✅ Clear after success
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ message: "Login Successful", token });

  } catch (error) {
    console.error("VERIFY ERROR:", error.response?.data || error.message);
    res.status(400).json({ message: "OTP verification failed" });
  }
});

// =========================
// 🔹 SUBMIT POLICY
// =========================
router.post("/submit-policy", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    user.hasSignedPolicy = true;
    user.policyStatus = status;

    await user.save();

    res.json({ message: "Policy response recorded!" });

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
