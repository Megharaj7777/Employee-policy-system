// =========================
// 1️⃣ SEND OTP (Normal SMS via Message Central)
// =========================
router.post("/send-otp", async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone required" });

    const cleanPhone = sanitizePhone(phone);
    const user = await User.findOne({ phone: cleanPhone }).select("+otpCount +otpLastSentDate");
    
    if (!user) return res.status(404).json({ message: "Employee not found in DB" });

    // Rate Limiting (Prevent abuse)
    const today = new Date().toDateString();
    if (user.otpLastSentDate && new Date(user.otpLastSentDate).toDateString() !== today) {
      user.otpCount = 0;
    }
    if (user.otpCount >= 10) return res.status(429).json({ message: "Daily limit reached" });

    // 🚀 MESSAGE CENTRAL SMS CALL
    try {
      const response = await axios({
        method: 'post',
        url: 'https://cpaas.messagecentral.com/verification/v3/send',
        params: {
          countryCode: '91',
          customerId: process.env.MC_CUSTOMER_ID,
          flowType: 'SMS', // 🔹 Changed from WHATSAPP to SMS
          mobileNumber: cleanPhone,
          otpLength: '4'
        },
        headers: {
          'authToken': process.env.MC_AUTH_TOKEN 
        }
      });

      if (response.data.responseCode === 200) {
        // Message Central generates the OTP. We capture it to sync with our DB.
        const sentOtp = response.data.data.otp;

        await User.findOneAndUpdate(
          { phone: cleanPhone },
          {
            $set: {
              verificationId: sentOtp, 
              otpExpiry: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
              otpLastSentDate: new Date(),
            },
            $inc: { otpCount: 1 }
          }
        );

        console.log(`✅ [SMS SENT] OTP for ${cleanPhone}: ${sentOtp}`);
        res.json({ message: "SMS OTP sent successfully" });
      } else {
        res.status(400).json({ message: "SMS Gateway error: " + response.data.message });
      }
    } catch (apiErr) {
      console.error("SMS Provider Error:", apiErr.response?.data || apiErr.message);
      res.status(500).json({ message: "Failed to send SMS OTP" });
    }
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});