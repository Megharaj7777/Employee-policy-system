const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const User = require("../models/User");
const auth = require("../middleware/auth");

// 🔹 Utility: Clean phone number
const sanitizePhone = (phone) => phone.replace(/\D/g, "");

// =========================
// 🔹 ADMIN LOGIN
// =========================
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      message: "Login Successful",
      token
    });

  } catch (error) {
    console.error("Admin Login Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


// =========================
// 🔹 GET ALL EMPLOYEES (WITH SEARCH)
// =========================
router.get("/employees", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access Denied" });
    }

    const { search } = req.query;

    let query = {};

    // 🔥 SEARCH BY NAME OR PHONE
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { phone: { $regex: search } }
        ]
      };
    }

    const users = await User.find(query)
      .select("name phone hasSignedPolicy policyStatus createdAt")
      .sort({ createdAt: -1 });

    res.json({
      count: users.length,
      employees: users
    });

  } catch (error) {
    console.error("Fetch Employees Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


// =========================
// 🔹 CREATE EMPLOYEE
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

    if (phone.length < 10) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "Employee already exists" });
    }

    const user = new User({
      name,
      phone,
      hasSignedPolicy: false,
      policyStatus: "pending"
    });

    await user.save();

    res.status(201).json({
      message: "Employee Created Successfully",
      user
    });

  } catch (error) {
    console.error("Create Employee Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


// =========================
// 🔹 DELETE EMPLOYEE
// =========================
router.delete("/delete-employee/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access Denied" });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({ message: "Employee Deleted Successfully" });

  } catch (error) {
    console.error("Delete Employee Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


// =========================
// 🔹 UPDATE EMPLOYEE (NEW - BONUS 🔥)
// =========================
router.put("/update-employee/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access Denied" });
    }

    let { name, phone } = req.body;

    const updateData = {};

    if (name) updateData.name = name.trim();
    if (phone) updateData.phone = sanitizePhone(phone);

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({
      message: "Employee Updated Successfully",
      user
    });

  } catch (error) {
    console.error("Update Employee Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


module.exports = router;
