require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// 🔹 1. FIXED CORS CONFIGURATION
const corsOptions = {
  origin: ["https://hindmed-employee-login.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200 
};

// Apply CORS to ALL routes. 
// This automatically handles OPTIONS requests for your defined routes.
app.use(cors(corsOptions));

// REMOVED: app.options("/*", ...) as it causes PathError in Node 22+
// If you specifically need to handle preflight for all possible paths, 
// use the regex-free approach:
app.options('*', cors(corsOptions)); // If this still fails, delete this line entirely.

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

// 🔹 5. Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

// 🔹 6. Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));