const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const auth = require("../middleware/auth");

// 🔹 SEND OTP
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number required" });

    // Clean phone number (remove non-digits)
    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "Employee record not found. Contact Admin." });
    }

    // 🔹 Daily Reset Logic
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }

    // 🔹 Limit check (3 attempts per day)
    if (user.otpCount >= 3) {
      return res.status(429).json({ message: "Maximum daily OTP limit reached (3/3)." });
    }

    // 🔹 Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 🔹 External API Call to MessageCentral
    try {
      // Logic: Some MessageCentral V3 accounts require the customerId WITHOUT the 'C-' prefix in the body
      const bodyCustomerId = process.env.MESSAGECENTRAL_CUSTOMER_ID.replace("C-", "");

      await axios.post(
        "https://cpaas.messagecentral.com/verification/v3/send",
        {
          countryCode: "91",
          customerId: bodyCustomerId, 
          flowType: "SMS",
          mobileNumber: phone,
          otpLength: 6,
          otp: otp,
          message: `Your OTP for Hindware Policy Portal is ${otp}`
        },
        {
          headers: { 
            "authToken": process.env.MESSAGECENTRAL_AUTH_TOKEN.trim(),
            "Content-Type": "application/json"
          },
          timeout: 5000
        }
      );

      // ✅ SUCCESS: SMS accepted by gateway, now update database
      user.otp = otp;
      user.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 mins
      user.otpCount += 1;
      user.otpLastSentDate = new Date();
      await user.save();

      res.json({ message: `OTP Sent Successfully (${user.otpCount}/3)` });

    } catch (apiErr) {
      // Detailed logging for Render logs
      console.error("SMS GATEWAY ERROR:", apiErr.response?.data || apiErr.message);
      
      const status = apiErr.response?.status === 401 ? 401 : 502;
      return res.status(status).json({ 
        message: "SMS Gateway error. Please check credentials or DLT template.",
        error: apiErr.response?.data 
      });
    }

  } catch (error) {
    console.error("INTERNAL SERVER ERROR:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🔹 VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });
    if (!user || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Clear OTP data after success
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
    res.status(500).json({ message: "Verification failed" });
  }
});

// 🔹 SUBMIT POLICY (Requires 'auth' middleware)
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