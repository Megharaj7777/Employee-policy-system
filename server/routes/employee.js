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

    if (!phone) {
      return res.status(400).json({ message: "Phone number required" });
    }

    // Clean phone number
    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ message: "Contact Administrator" });
    }

    // 🔹 Reset daily count
    const today = new Date().toDateString();
    if (
      user.otpLastSentDate &&
      new Date(user.otpLastSentDate).toDateString() !== today
    ) {
      user.otpCount = 0;
    }

    // 🔹 Limit check
    if (user.otpCount >= 3) {
      return res
        .status(429)
        .json({ message: "OTP limit reached. Try again tomorrow." });
    }

    // 🔹 Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    user.otpCount += 1;
    user.otpLastSentDate = new Date();

    await user.save();

    // 🔹 Send OTP via MessageCentral
    const response = await axios.post(
      "https://cpaas.messagecentral.com/verification/v3/send",
      {
        countryCode: "91",
        customerId: process.env.MESSAGECENTRAL_CUSTOMER_ID,
        flowType: "SMS",
        mobileNumber: phone,
        otpLength: 6,
        otp: otp
      },
      {
        headers: {
          authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN,
          "Content-Type": "application/json"
        },
        timeout: 5000
      }
    );

    console.log("MessageCentral Response:", response.data);

    res.json({
      message: `OTP Sent Successfully (${user.otpCount}/3)`
    });

  } catch (error) {
    console.error("SEND OTP ERROR:", error.response?.data || error.message);

    res.status(500).json({
      message: "Failed to send OTP",
      error: error.response?.data || error.message
    });
  }
});


// 🔹 VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;

    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP Expired" });
    }

    // 🔹 Clear OTP
    user.otp = null;
    user.otpExpiry = null;

    await user.save();

    // 🔹 Generate JWT
    const token = jwt.sign(
      { id: user._id, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login Successful",
      token
    });

  } catch (error) {
    console.error("VERIFY OTP ERROR:", error.message);

    res.status(500).json({
      message: "Verification failed"
    });
  }
});


// 🔹 GET CURRENT USER
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name phone hasSignedPolicy policyStatus"
    );

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
