const express = require("express");
const router = express.Router();
const User = require("../models/User");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const sanitizePhone = (phone) => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
};

// Middleware to protect routes
const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ message: "No token provided" });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch user and include necessary fields
    req.user = await User.findById(decoded.id).select("+name +policyStatus +hasSignedPolicy");
    
    if (!req.user) return res.status(401).json({ message: "User not found" });
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
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
            const mcId = response.data.data.verificationId;

            await User.findOneAndUpdate(
                { phone: cleanPhone },
                {
                    $set: {
                        verificationId: mcId, 
                        otpExpiry: new Date(Date.now() + 5 * 60 * 1000)
                    }
                }
            );

            // UPDATED MESSAGE
            res.json({ 
                message: "OTP sent successfully", 
                displayCode: mcId 
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

        // Ensure we find the user and have their ID for the token
        const user = await User.findOne({ phone: cleanPhone }).select("+verificationId");
        
        if (!user || user.verificationId !== enteredId) {
            return res.status(400).json({ message: "Security Code mismatch" });
        }

        const verifyRes = await axios({
            method: 'get',
            url: 'https://cpaas.messagecentral.com/verification/v3/validateOtp',
            params: {
                countryCode: '91',
                mobileNumber: cleanPhone,
                verificationId: enteredId,
                customerId: process.env.MC_CUSTOMER_ID,
                code: otp
            },
            headers: { 'authToken': process.env.MC_AUTH_TOKEN }
        });

        if (verifyRes.data && verifyRes.data.responseCode === 200) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
            // UPDATED MESSAGE
            res.json({ message: "Login Successful", token });
        } else {
            res.status(400).json({ message: verifyRes.data.message || "Invalid OTP" });
        }
    } catch (err) {
        console.error("Verify API Error:", err.message);
        res.status(500).json({ message: "Verification service failed" });
    }
});

// =========================
// 3️⃣ GET CURRENT USER
// =========================
router.get("/me", protect, async (req, res) => {
    try {
        res.json({ user: req.user });
    } catch (err) {
        res.status(500).json({ message: "Error fetching user profile" });
    }
});

// =========================
// 4️⃣ SUBMIT POLICY
// =========================
router.post("/submit-policy", protect, async (req, res) => {
    try {
        const { status } = req.body;
        req.user.hasSignedPolicy = true;
        req.user.policyStatus = status;
        await req.user.save();
        res.json({ message: "Policy response recorded successfully" });
    } catch (err) {
        res.status(500).json({ message: "Failed to save response" });
    }
});

module.exports = router;