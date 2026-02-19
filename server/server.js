require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// 🔹 MongoDB Connection (better handling)
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB Connected"))
.catch(err => {
  console.error("DB Error:", err.message);
  process.exit(1);
});

// 🔹 Routes
const employeeRoutes = require("./routes/employee");
const adminRoutes = require("./routes/admin");

app.use("/api/employee", employeeRoutes);
app.use("/api/admin", adminRoutes);

// 🔹 Health check (very useful)
app.get("/", (req, res) => {
  res.send("API Running...");
});

// 🔹 Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
