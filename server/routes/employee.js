const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");



// =========================
// 🔹 SEND OTP
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number required" });
    }

    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(400).json({ message: "Contact Administrator" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 5 * 60 * 1000;

    user.otp = otp;
    user.otpExpiry = expiry;
    await user.save();

    await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        sender_id: "FSTSMS",
        message: `Your OTP is ${otp}`,
        route: "v3",
        numbers: phone
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ message: "OTP Sent Successfully" });

  } catch (error) {
    console.error("Send OTP Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


// =========================
// 🔹 VERIFY OTP
// =========================
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;

    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });

    if (
      !user ||
      user.otp !== otp ||
      user.otpExpiry < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or Expired OTP" });
    }

    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ 
      message: "Login Successful",
      token,
      userId: user._id
    });

  } catch (error) {
    console.error("Verify OTP Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


// =========================
// 🔹 SIGN POLICY
// =========================

router.post("/sign-policy", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    await User.findByIdAndUpdate(userId, {
      hasSignedPolicy: true
    });

    res.json({ message: "Policy Signed Successfully" });

  } catch (error) {
    console.error("Sign Policy Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


module.exports = router;
