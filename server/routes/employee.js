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

    // 🔹 MessageCentral V3 API Call
    try {
      const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID.trim();
      const authToken = process.env.MESSAGECENTRAL_AUTH_TOKEN.trim();

      // MessageCentral V3 prefers parameters in the query string for the verification endpoint
      const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${customerId}&flowType=SMS&mobileNumber=${phone}`;

      const response = await axios.post(url, {}, {
        headers: { 
          "authToken": authToken,
          "Content-Type": "application/json"
        },
        timeout: 8000
      });

      /* NOTE: MessageCentral V3 generates the OTP for you to ensure DLT compliance.
         We extract it from their response to save it in our database for verification.
      */
      const gatewayData = response.data;
      const receivedOtp = gatewayData.data ? gatewayData.data.verificationCode : null;

      if (!receivedOtp) {
        console.error("GATEWAY RESPONSE MISSING OTP:", gatewayData);
        throw new Error("Gateway accepted request but did not return a verification code.");
      }

      // ✅ SUCCESS: Update database
      user.otp = receivedOtp.toString();
      user.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 mins
      user.otpCount += 1;
      user.otpLastSentDate = new Date();
      await user.save();

      res.json({ message: `OTP Sent Successfully (${user.otpCount}/3)` });

    } catch (apiErr) {
      // Detailed logging for Render logs
      console.error("SMS GATEWAY ERROR:", apiErr.response?.data || apiErr.message);
      
      return res.status(502).json({ 
        message: "SMS Gateway error. Please check Message Central credits or DLT status.",
        error: apiErr.response?.data || apiErr.message
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
    
    // Check if user exists and OTP matches
    if (!user || !user.otp || user.otp !== otp.toString()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Check expiry
    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Clear OTP data after success
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // Create JWT
    const token = jwt.sign(
      { id: user._id, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ message: "Login Successful", token });

  } catch (error) {
    console.error("VERIFY ERROR:", error.message);
    res.status(500).json({ message: "Verification failed" });
  }
});

// 🔹 SUBMIT POLICY
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