const express = require("express");
const serverless = require("serverless-http");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

// Models
const User = require("./models/User");
const Photo = require("./models/Photo");
const Comment = require("./models/Comment");

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ------------------ MongoDB ------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error(err));

// Your routes here (copy all routes from your current app)

// ------------------ Export for Vercel ------------------
module.exports = app;
module.exports.handler = serverless(app);
