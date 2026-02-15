require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected");

    await User.create({
      name: "Megha Raj",       // <-- Add the name here
      phone: "+916361862624",
      hasSignedPolicy: false
    });

    console.log("User Inserted");
    process.exit();
  })
  .catch(err => console.log(err));
