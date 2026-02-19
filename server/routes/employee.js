const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const sanitizePhone = (phone) => phone.replace(/\D/g, "").slice(-10);

// =========================
// 🔹 SEND OTP
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    phone = sanitizePhone(phone);

    // 🔥 FIX
    const user = await User.findOne({ phone }).select("+otp +otpExpiry");

    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Daily reset
    const today = new Date().toDateString();
    if (
      user.otpLastSentDate &&
      new Date(user.otpLastSentDate).toDateString() !== today
    ) {
      user.otpCount = 0;
    }

    if (user.otpCount >= 3) {
      return res.status(429).json({ message: "OTP limit reached" });
    }

    const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&flowType=SMS&mobileNumber=${phone}`;

    const response = await axios.post(url, {}, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    const verificationId = response.data?.data?.verificationId;

    if (!verificationId) {
      console.error("BAD RESPONSE:", response.data);
      return res.status(500).json({ message: "OTP send failed" });
    }

    // ✅ Save verificationId
    user.otp = verificationId;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // FIXED
    user.otpCount += 1;
    user.otpLastSentDate = new Date();

    await user.save();

    res.json({ message: "OTP sent successfully" });

  } catch (err) {
    console.error("SEND ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "SMS error" });
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

    // 🔥 MAIN FIX
    const user = await User.findOne({ phone }).select("+otp +otpExpiry");

    console.log("VERIFY USER:", user);

    if (!user || !user.otp) {
      return res.status(400).json({ message: "OTP not requested" });
    }

    if (user.otpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    const url = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${phone}&verificationId=${user.otp}&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&code=${otp}`;

    const response = await axios.get(url, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    console.log("VERIFY RESPONSE:", response.data);

    const status = response.data?.data?.verificationStatus;

    if (status !== "VERIFIED") {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ Clear OTP
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
    res.status(400).json({ message: "OTP verification failed" });
  }
});

module.exports = router;
