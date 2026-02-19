const User = require("../models/User");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// =========================
// 🔹 SEND OTP (Fast2SMS SMS Route)
// =========================
exports.sendOTP = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number required" });

    // Clean phone number (ensure 10 digits)
    phone = phone.replace(/\D/g, "").slice(-10);

    const user = await User.findOne({ phone }).select("+otpCount +otpLastSentDate");
    if (!user) return res.status(404).json({ message: "Employee not found. Contact Admin." });

    // Generate 4-digit OTP
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();

    // 🚀 Calling Fast2SMS - Quick SMS Route
    // This is the most reliable route for bypassing DLT immediately.
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_KEY}&variables_values=${generatedOtp}&route=otp&numbers=${phone}`;

    const response = await axios.get(url);

    if (response.data.return === true) {
      // ✅ Save to DB
      user.verificationId = generatedOtp; 
      user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); 
      user.otpLastSentDate = new Date();
      await user.save();

      return res.json({ message: "OTP Sent Successfully via SMS" });
    } else {
      console.error("Fast2SMS API Response:", response.data);
      return res.status(400).json({ message: response.data.message || "SMS Gateway refused" });
    }

  } catch (err) {
    console.error("SEND ERROR:", err.message);
    res.status(500).json({ message: "SMS Service Connection Error" });
  }
};

// =========================
// 🔹 VERIFY OTP
// =========================
exports.verifyOTP = async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = phone.replace(/\D/g, "").slice(-10);

    const user = await User.findOne({ phone }).select("+verificationId +otpExpiry");

    if (!user || !user.verificationId) {
      return res.status(400).json({ message: "OTP not requested or session expired" });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // Compare stored OTP with user input
    if (user.verificationId === otp.toString()) {
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
      return res.status(400).json({ message: "Invalid OTP code" });
    }
  } catch (err) {
    res.status(500).json({ message: "Verification failed" });
  }
};