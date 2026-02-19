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

    // Normalize phone number
    phone = phone.replace(/\D/g, "");

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "User not found. Contact Admin." });
    }

    // 🔹 Reset OTP count daily
    const today = new Date().toDateString();
    if (
      user.otpLastSentDate &&
      new Date(user.otpLastSentDate).toDateString() !== today
    ) {
      user.otpCount = 0;
    }

    // 🔹 Limit OTP to 3 per day
    if (user.otpCount >= 3) {
      return res.status(429).json({
        message: "OTP limit reached. Try again tomorrow.",
      });
    }

    // 🔹 Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 mins
    user.otpCount = (user.otpCount || 0) + 1;
    user.otpLastSentDate = new Date();

    await user.save();

    // 🔥 SEND OTP via Message Central
    try {
      await axios.post(
        "https://cpaas.messagecentral.com/verification/v3/send",
        {
          countryCode: "91",
          mobileNumber: phone,
          flowType: "SMS",
          customerId: process.env.MESSAGECENTRAL_CUSTOMER_ID,
          message: `Your OTP is ${otp}`,
        },
        {
          headers: {
            authToken: process.env.MESSAGECENTRAL_AUTH_TOKEN,
          },
        }
      );
    } catch (smsError) {
      console.error("SMS Error:", smsError.response?.data || smsError.message);
    }

    res.json({
      message: `OTP Sent Successfully (${user.otpCount}/3)`,
      expiresIn: 300,
    });

  } catch (err) {
    console.error("Send OTP Error:", err.message);
    res.status(500).json({ message: "Server Error" });
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
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔹 Validate OTP
    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({
        message: "Invalid or Expired OTP",
      });
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
      token,
      userId: user._id,
    });

  } catch (err) {
    console.error("Verify OTP Error:", err.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// =========================
// 🔹 GET CURRENT USER
// =========================
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "name phone hasSignedPolicy policyStatus"
    );

    res.json({ user });

  } catch (err) {
    console.error("GetMe Error:", err.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// =========================
// 🔹 SUBMIT POLICY
// =========================
exports.submitPolicy = async (req, res) => {
  try {
    const { status } = req.body; // "agreed" or "disagreed"

    if (!["agreed", "disagreed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.policyStatus = status;
    user.hasSignedPolicy = true;

    await user.save();

    res.json({
      message: "Policy response recorded successfully!",
    });

  } catch (err) {
    console.error("Submit Policy Error:", err.message);
    res.status(500).json({ message: "Server Error" });
  }
};
