// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const authRoutes = require('./routes/authRoutes');

// const app = express();
// const PORT = process.env.PORT || 4000;

// app.use(cors());
// app.use(express.json());

// // Routes
// app.use('/api/auth', authRoutes);

// app.get('/', (req, res) => res.send('Backend API is running ✅'));

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const profileRoutes = require("./routes/profileRoutes")

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use('/api/profile', profileRoutes);

// Health check
app.get("/", (req, res) =>
  res.json({
    status: "success",
    message: "Study Advisor Backend API is running ✅",
    version: "1.0.0",
  })
);

async function startServer() {
  try {
    const chatModule = await import("./routes/chat.mjs");
    app.use("/api/chat", chatModule.default);
    console.log("RAG chat mounted at POST /api/chat");
  } catch (err) {
    console.error("Could not load RAG chat routes (routes/chat.mjs):", err.message);
  }

  // 404 handler (must be after all routes)
  app.use((req, res, next) => {
    res.status(404).json({
      status: "error",
      message: "API endpoint not found",
      path: req.originalUrl
    });
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      ...(process.env.NODE_ENV === "development" && { error: err.message }),
    });
  });

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
