const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");

// 🔹 SEND OTP (With 3-Attempt Daily Limit)
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number required" });

    phone = phone.replace(/\D/g, "");
    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ message: "Contact Administrator" });

    // Daily Reset Logic
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }

    if (user.otpCount >= 3) {
      return res.status(429).json({ message: "OTP limit reached. Please try again tomorrow." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    user.otpCount += 1;
    user.otpLastSentDate = new Date();
    await user.save();

    await axios.post("https://www.fast2sms.com/dev/bulkV2", {
      sender_id: "FSTSMS",
      message: `Your OTP is ${otp}`,
      route: "v3",
      numbers: phone
    }, {
      headers: {
        authorization: process.env.FAST2SMS_KEY,
        "Content-Type": "application/json"
      }
    });

    res.json({ message: `OTP Sent Successfully (${user.otpCount}/3)` });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// 🔹 VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = phone.replace(/\D/g, "");
    const user = await User.findOne({ phone });

    if (!user || user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or Expired OTP" });
    }

    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign({ id: user._id, role: "employee" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login Successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// 🔹 GET CURRENT USER (For Read-Only Policy Logic)
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("name phone hasSignedPolicy policyStatus");
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

// 🔹 SUBMIT POLICY
router.post("/submit-policy", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const user = await User.findById(req.user.id);
    user.hasSignedPolicy = true;
    user.policyStatus = status;
    await user.save();
    res.json({ message: "Policy response recorded!" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;