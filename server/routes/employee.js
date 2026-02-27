const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("+name +policyStatus +hasSignedPolicy");
    if (!req.user) return res.status(401).json({ message: "User not found" });
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};


// =========================
// 1️⃣ SEND OTP
// =========================
router.post("/send-otp", async (req, res) => {
    try {
        let { phone } = req.body;
        const cleanPhone = sanitizePhone(phone);
        const user = await User.findOne({ phone: cleanPhone });
        
        if (!user) return res.status(404).json({ message: "Employee not found" });

        const response = await axios({
            method: 'post',
            url: 'https://cpaas.messagecentral.com/verification/v3/send',
            params: {
                countryCode: '91',
                customerId: process.env.MC_CUSTOMER_ID,
                flowType: 'SMS',
                mobileNumber: cleanPhone,
                otpLength: '4'
            },
            headers: { 'authToken': process.env.MC_AUTH_TOKEN }
        });

        if (response.data && response.data.responseCode === 200) {
            const mcId = response.data.data.verificationId; // This is the ID we need

            await User.findOneAndUpdate(
                { phone: cleanPhone },
                {
                    $set: {
                        verificationId: mcId, 
                        otpExpiry: new Date(Date.now() + 5 * 60 * 1000)
                    }
                }
            );

            res.json({ 
                message: "OTP sent", 
                displayCode: mcId // We send this to the frontend to show on screen
            });
        } else {
            res.status(400).json({ message: "SMS Gateway rejected request" });
        }
    } catch (err) {
        console.error("Send OTP Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ message: "Failed to connect to Message Central" });
    }
});

// =========================
// 2️⃣ VERIFY OTP
// =========================
router.post("/verify-otp", async (req, res) => {
    try {
        let { phone, otp, enteredId } = req.body; 
        const cleanPhone = sanitizePhone(phone);

        const user = await User.findOne({ phone: cleanPhone }).select("+verificationId");
        
        if (!user || user.verificationId !== enteredId) {
            return res.status(400).json({ message: "Security Code mismatch" });
        }

        // Calling Message Central Validate API
        const verifyRes = await axios({
            method: 'get',
            url: 'https://cpaas.messagecentral.com/verification/v3/validateOtp',
            params: {
                countryCode: '91',
                mobileNumber: cleanPhone,
                verificationCode: otp,            // Code from SMS
                verificationId: enteredId,        // ID from Screen
                customerId: process.env.MC_CUSTOMER_ID
            },
            headers: { 'authToken': process.env.MC_AUTH_TOKEN }
        });

        if (verifyRes.data && verifyRes.data.responseCode === 200) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
            res.json({ message: "Login Successful", token });
        } else {
            // Log the specific error from Message Central
            console.log("MC Validation Failed:", verifyRes.data);
            res.status(400).json({ message: verifyRes.data.message || "Invalid OTP" });
        }
    } catch (err) {
        // This catch block prevents the 500 crash by logging the error
        console.error("Verify API Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ 
            message: "Verification service failed", 
            error: err.response ? err.response.data.message : "Network error" 
        });
    }
});

module.exports = router;
module.exports = router;