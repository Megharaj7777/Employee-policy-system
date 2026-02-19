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
    
    const user = await User.findOne({ phone }).select("+otpCount +otpLastSentDate");

    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }

    if (user.otpCount >= 3) {
      return res.status(429).json({ message: "OTP limit reached for today" });
    }

    const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&flowType=SMS&mobileNumber=${phone}`;

    const response = await axios.post(url, {}, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    const vId = response.data?.data?.verificationId || response.data?.verificationId;

    if (!vId) {
      console.error("API Response Missing ID:", response.data);
      return res.status(500).json({ message: "OTP provider failed to return ID" });
    }

    await User.findOneAndUpdate(
      { phone },
      {
        $set: {
          verificationId: vId, 
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
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    phone = sanitizePhone(phone);

    // 1. Get user with hidden verificationId
    const user = await User.findOne({ phone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "OTP not requested or session expired" });
    }

    // 2. Validate against Message Central
    const url = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${phone}&verificationId=${user.verificationId}&customerId=${process.env.MESSAGECENTRAL_CUSTOMER_ID}&code=${otp}`;

    const response = await axios.get(url, {
      headers: { authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN }
    });

    console.log("MESSAGE CENTRAL API RESPONSE:", JSON.stringify(response.data, null, 2));

    const isVerified = response.data.responseCode === 200 && 
                       (response.data.data?.verificationStatus === "VERIFIED" || response.data.verificationStatus === "VERIFIED");

    if (isVerified) {
      // ✅ SUCCESS: Clear session data
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
    res.status(400).json({ message: "OTP verification failed on server" });
  }
});

module.exports = router;