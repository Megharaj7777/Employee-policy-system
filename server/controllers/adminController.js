const User = require("../models/User");
const jwt = require("jsonwebtoken");

// 🔹 Admin Login
exports.login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign(
      { role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );
    return res.json({ message: "Login Successful", token });
  }

  res.status(401).json({ message: "Invalid credentials" });
};

// 🔹 Create User
exports.createUser = async (req, res) => {
  try {
    let { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    name = name.trim();
    phone = phone.replace(/\D/g, "");

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const newUser = new User({
      name,
      phone,
      hasSignedPolicy: false
    });

    await newUser.save();
    res.status(201).json({ message: "User created successfully", user: newUser });

  } catch (err) {
    console.error("Create User Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
};

// 🔹 Get all Users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-otp -otpExpiry -__v");
    res.json({ users });
  } catch (err) {
    console.error("Get Users Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
};

// 🔹 Delete User
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete User Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
};
