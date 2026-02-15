const User = require("../models/User");
const jwt = require("jsonwebtoken");

exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: "User not found" });

    const today = new Date().toDateString();

    if (
      user.otpLastSentDate &&
      new Date(user.otpLastSentDate).toDateString() !== today
    ) {
      user.otpCount = 0;
    }

    if (user.otpCount >= 3) {
      return res.status(400).json({
        message: "OTP limit crossed. Try again tomorrow."
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.otp = otp;
    user.otpExpiry = Date.now() + 60 * 1000; // 60 sec
    user.otpCount += 1;
    user.otpLastSentDate = new Date();

    await user.save();

    console.log("OTP:", otp); // SMS integration here

    res.json({
      message: `OTP Sent (${user.otpCount}/3)`,
      expiresIn: 60
    });

  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or Expired OTP" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login Successful", token });

  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};

exports.submitPolicy = async (req, res) => {
  try {
    const { status } = req.body;
    const user = await User.findById(req.user.id);

    user.policyStatus = status;
    await user.save();

    res.json({ message: "Policy submitted successfully" });

  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};
