const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const User = require("../models/User");
const auth = require("../middleware/auth");

const sanitizePhone = (phone) => phone.replace(/\D/g, "");

// ... (Login Route remains the same) ...

// =========================
// 🔹 GET ALL EMPLOYEES (Optimized)
// =========================
router.get("/employees", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access Denied" });
    }

    // Explicitly select the fields the dashboard needs
    const users = await User.find()
      .select("name phone hasSignedPolicy policyStatus createdAt")
      .sort({ createdAt: -1 }); // Show newest employees first

    res.json({ employees: users });

  } catch (error) {
    console.error("Fetch Employees Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// =========================
// 🔹 CREATE EMPLOYEE (Sync with Model Enum)
// =========================
router.post("/create-employee", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access Denied" });
    }

    let { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    name = name.trim();
    phone = sanitizePhone(phone);

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "Employee already exists" });
    }

    const user = new User({
      name,
      phone,
      hasSignedPolicy: false,
      policyStatus: "pending" // 🔹 Explicitly match your Schema enum
    });

    await user.save();
    res.status(201).json({ message: "Employee Created Successfully", user });

  } catch (error) {
    console.error("Create Employee Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// ... (Delete Route remains the same) ...

module.exports = router;