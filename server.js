const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Models
const User = require("./api/middleware/models/User");
const Photo = require("./api/middleware/models/Photo");
const Comment = require("./api/middleware/models/Comment");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ------------------ MongoDB ------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error(err));

// ------------------ JWT Middleware ------------------
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ success: false, message: "No token" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ------------------ Cloudinary ------------------
const storage = multer.diskStorage({});
const upload = multer({ storage });

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// ------------------ Auth Routes ------------------
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashed });
    await user.save();
    res.json({ success: true, message: "User registered" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "2h" });
    res.json({ success: true, token, userId: user._id, username: user.username });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------ Photo Routes ------------------
app.post("/upload", authMiddleware, upload.single("photo"), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.file.path, { folder: "gallery" });
    const newPhoto = new Photo({
      url: result.secure_url,
      description: req.body.description || "",
      user: req.user.id
    });
    await newPhoto.save();
    res.json({ success: true, photo: newPhoto });
  } catch (error) {
    res.status(500).json({ success: false, error });
  }
});

app.get("/photos", authMiddleware, async (req, res) => {
  try {
    const photos = await Photo.find()
      .populate("user", "username email") // photo uploader ka naam
      .populate("comments.user", "username") // comment karne wale ka naam
      .sort({ createdAt: -1 });

    res.json(photos);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/photos/:id/comment", authMiddleware, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ success: false, message: "Photo not found" });

    const comment = { text: req.body.text, user: req.user.id };
    photo.comments.push(comment);
    await photo.save();

    // wapas populate karke bhej
    const updatedPhoto = await Photo.findById(req.params.id)
      .populate("user", "username")
      .populate("comments.user", "username");

    res.json({ success: true, comments: updatedPhoto.comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.put("/photos/:id/description", authMiddleware, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ success: false, message: "Photo not found" });
    if (photo.user.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: "Not allowed" });

    photo.description = req.body.description;
    await photo.save();
    res.json({ success: true, photo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/photos/:id/like", authMiddleware, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ success: false, message: "Photo not found" });

    const alreadyLiked = photo.likes.includes(req.user.id);
    if (alreadyLiked) {
      photo.likes.pull(req.user.id);
    } else {
      photo.likes.push(req.user.id);
    }
    await photo.save();
    res.json({ success: true, likes: photo.likes.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------ Comment Routes ------------------
app.post("/photos/:id/comment", authMiddleware, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ success: false, message: "Photo not found" });

    const comment = { text: req.body.text, user: req.user.id };
    photo.comments.push(comment);
    await photo.save();
    res.json({ success: true, comments: photo.comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/photos/:photoId/comment/:commentId", authMiddleware, async (req, res) => {
  try {
    const { photoId, commentId } = req.params;
    const photo = await Photo.findById(photoId);
    if (!photo) return res.status(404).json({ success: false, message: "Photo not found" });

    const comment = photo.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });
    if (comment.user.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: "Not allowed" });

    comment.deleteOne();
    await photo.save();
    res.json({ success: true, message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/photos/:id", authMiddleware, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).json({ success: false, message: "Photo not found" });
    if (photo.user.toString() !== req.user.id)
      return res.status(403).json({ success: false, message: "Not allowed" });

    await photo.deleteOne();
    res.json({ success: true, message: "Photo deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ------------------ Start server ------------------
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
