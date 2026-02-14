const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const User = require("../models/User");
const auth = require("../middleware/auth");




// =========================
// 🔹 ADMIN LOGIN
// =========================
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

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

    res.json({ message: "Login Successful", token });

  } catch (error) {
    console.error("Admin Login Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


// =========================
// 🔹 GET ALL EMPLOYEES
// =========================
router.get("/employees", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access Denied" });
    }

    const users = await User.find().select("-otp -otpExpiry");
    res.json(users);

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

    let { phone } = req.body;

    phone = phone.replace(/\D/g, "");

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.json({ message: "Employee already exists" });
    }

    const user = new User({ phone });
    await user.save();

    res.json({ message: "Employee Created Successfully", user });

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

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: "Employee Deleted Successfully" });

  } catch (error) {
    console.error("Delete Employee Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
});


module.exports = router;
