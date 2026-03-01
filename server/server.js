require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// 🔹 1. FIXED CORS CONFIGURATION
// This allows your specific Vercel frontend to communicate with this Render backend
const corsOptions = {
  origin: ["https://hindmed-employee-login.vercel.app", "http://localhost:3000"], // Add localhost for local testing
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // Allow cookies/auth headers if needed
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Handle preflight requests manually for all routes (Extra safety for Render/Vercel)
app.options("*", cors(corsOptions));

app.use(express.json());

// 🔹 2. MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => {
  console.error("DB Error:", err.message);
  process.exit(1);
});

// 🔹 3. Routes
const employeeRoutes = require("./routes/employee");
const adminRoutes = require("./routes/admin");

app.use("/api/employee", employeeRoutes);
app.use("/api/admin", adminRoutes);

// 🔹 4. Health check
app.get("/", (req, res) => {
  res.status(200).json({ status: "API is active", env: process.env.NODE_ENV });
});

// 🔹 5. Error Handling Middleware (Prevents CORS errors on crashes)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

// 🔹 6. Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));s