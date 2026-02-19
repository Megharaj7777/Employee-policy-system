const User = require("../models/User");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// =========================
// 🔹 SEND OTP
// =========================
exports.sendOTP = async (req, res) => {
  try {
    let { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number required" });
    }

    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "User not found. Contact Admin." });
    }

    // 🔹 Reset daily count
    const today = new Date().toDateString();
    if (
      user.otpLastSentDate &&
      new Date(user.otpLastSentDate).toDateString() !== today
    ) {
      user.otpCount = 0;
    }

    if (user.otpCount >= 3) {
      return res.status(429).json({ message: "OTP limit reached. Try tomorrow." });
    }

    // 🔥 SEND OTP
    const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID.trim();
    const authToken = process.env.MESSAGECENTRAL_AUTH_TOKEN.trim();

    const url = `https://cpaas.messagecentral.com/verification/v3/send?countryCode=91&customerId=${customerId}&flowType=SMS&mobileNumber=${phone}`;

    const response = await axios.post(url, {}, {
      headers: {
        authToken: authToken,
        "Content-Type": "application/json"
      }
    });

    const data = response.data;

    if (!data || !data.data || !data.data.verificationId) {
      console.error("INVALID GATEWAY RESPONSE:", data);
      return res.status(500).json({ message: "Failed to send OTP" });
    }

    // ✅ Store verificationId instead of OTP
    user.otp = data.data.verificationId;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    user.otpCount += 1;
    user.otpLastSentDate = new Date();
    await user.save();

    return res.json({
      message: `OTP Sent Successfully (${user.otpCount}/3)`
    });

  } catch (err) {
    console.error("SEND OTP ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "SMS Service Error" });
  }
};

// =========================
// 🔹 VERIFY OTP
// =========================
exports.verifyOTP = async (req, res) => {
  try {
    let { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone and OTP required" });
    }

    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });
    if (!user || !user.otp) {
      return res.status(400).json({ message: "OTP not requested" });
    }

    if (user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID.trim();
    const authToken = process.env.MESSAGECENTRAL_AUTH_TOKEN.trim();

    // 🔥 VERIFY USING verificationId
    const verifyUrl = `https://cpaas.messagecentral.com/verification/v3/validateOtp?countryCode=91&mobileNumber=${phone}&verificationId=${user.otp}&customerId=${customerId}&code=${otp}`;

    const response = await axios.get(verifyUrl, {
      headers: {
        authToken: authToken
      }
    });

    const result = response.data;

    if (!result || result.responseCode !== 200) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ Clear OTP
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // 🔐 Generate JWT
    const token = jwt.sign(
      { id: user._id, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login Successful",
      token
    });

  } catch (err) {
    console.error("VERIFY ERROR:", err.response?.data || err.message);
    res.status(400).json({ message: "OTP verification failed" });
  }
};
