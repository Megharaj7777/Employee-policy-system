const User = require("../models/User");
const jwt = require("jsonwebtoken");

// =========================
// 🔹 SEND OTP
// =========================
exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: "User not found. Contact Admin." });

    // Check if we need to reset the daily limit
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }

    // Limit to 3 OTPs per day for security
    if (user.otpCount >= 3) {
      return res.status(400).json({ message: "OTP limit reached. Try again tomorrow." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000; // 5 Minutes expiry
    user.otpCount += 1;
    user.otpLastSentDate = new Date();

    await user.save();

    console.log(`OTP for ${phone}: ${otp}`); // In production, replace with Fast2SMS logic

    res.json({ message: `OTP Sent (${user.otpCount}/3)`, expiresIn: 300 });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// =========================
// 🔹 VERIFY OTP
// =========================
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Validate OTP and Expiry
    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or Expired OTP" });
    }

    // Clear OTP after successful use
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // Sign Token with ID and Role
    const token = jwt.sign(
      { id: user._id, role: "employee" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login Successful", token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// =========================
// 🔹 SUBMIT POLICY
// =========================
exports.submitPolicy = async (req, res) => {
  try {
    const { status } = req.body; // Expecting "agreed" or "disagreed"
    
    // req.user.id comes from your 'auth' middleware
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔹 UPDATING BOTH FIELDS
    // policyStatus: matches your Schema Enum ["pending", "agreed", "disagreed"]
    // hasSignedPolicy: matches what your Admin Dashboard table usually looks for
    user.policyStatus = status;
    user.hasSignedPolicy = (status === "agreed");

    await user.save();

    res.json({ message: "Policy response recorded successfully!" });

  } catch (err) {
    console.error("Submit Policy Error:", err);
    res.status(500).json({ message: "Server Error: Could not save response." });
  }
};