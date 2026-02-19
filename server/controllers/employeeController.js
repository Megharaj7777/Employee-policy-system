const User = require("../models/User");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// =========================
// 🔹 SEND OTP (Fast2SMS WhatsApp Route)
// =========================
exports.sendOTP = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number required" });

    // Clean phone number
    phone = phone.replace(/\D/g, "").slice(-10);

    const user = await User.findOne({ phone }).select("+otpCount +otpLastSentDate");
    if (!user) return res.status(404).json({ message: "Employee not found. Contact Admin." });

    // 🔹 Daily Limit Logic
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 5) return res.status(429).json({ message: "Daily OTP limit reached." });

    // 1. Generate 4-digit OTP manually
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // 2. Call Fast2SMS WhatsApp API
    // Note: You must link your WhatsApp in the Fast2SMS panel first!
    const fast2smsUrl = `https://www.fast2sms.com/dev/whatsapp?authorization=${process.env.FAST2SMS_KEY}&variables_values=${generatedOtp}&route=otp&numbers=${phone}`;

    const response = await axios.get(fast2smsUrl);

    if (response.data.return === true) {
      // 3. Save OTP and Expiry to YOUR Database (verificationId field)
      user.verificationId = generatedOtp; 
      user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
      user.otpCount += 1;
      user.otpLastSentDate = new Date();
      await user.save();

      return res.json({ message: `WhatsApp OTP Sent (${user.otpCount}/5)` });
    } else {
      console.error("Fast2SMS API Error:", response.data);
      return res.status(500).json({ message: "WhatsApp gateway failed. Try SMS route." });
    }

  } catch (err) {
    console.error("SEND ERROR:", err.message);
    res.status(500).json({ message: "Communication Service Error" });
  }
};

// =========================
// 🔹 VERIFY OTP (Manual Check)
// =========================
exports.verifyOTP = async (req, res) => {
  try {
    let { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    phone = phone.replace(/\D/g, "").slice(-10);

    // 🔥 Get user with hidden security fields
    const user = await User.findOne({ phone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "No active session. Request a new OTP." });
    }

    // 1. Check Expiry
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP has expired." });
    }

    // 2. Compare OTP (Manual Check - No API call needed here!)
    if (user.verificationId === otp.toString()) {
      // ✅ Success: Clear the session
      user.verificationId = null;
      user.otpExpiry = null;
      await user.save();

      // Generate JWT
      const token = jwt.sign(
        { id: user._id, role: "employee" },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );

      return res.json({ message: "Login Successful", token });
    } else {
      return res.status(400).json({ message: "Invalid OTP code." });
    }

  } catch (err) {
    console.error("VERIFY ERROR:", err.message);
    res.status(500).json({ message: "Internal Verification Error" });
  }
};