const User = require("../models/User");
const jwt = require("jsonwebtoken");

// Login logic
exports.login = (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "2h" });
    return res.json({ token });
  }
  res.status(401).json({ message: "Invalid credentials" });
};

// GET all users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find(); 
    // This returns an array: [{_id:..., name:..., phone:...}]
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// Create user
exports.createUser = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const newUser = new User({ name, phone });
    await newUser.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};