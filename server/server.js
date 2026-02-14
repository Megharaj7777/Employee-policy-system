require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 🔹 MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("DB Error:", err));

// 🔹 Routes
const employeeRoutes = require("./routes/employee");
const adminRoutes = require("./routes/admin");
app.use("/api/employee", employeeRoutes);
app.use("/api/admin", adminRoutes);

// 🔹 Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
