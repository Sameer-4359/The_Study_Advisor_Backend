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
const bcrypt = require("bcrypt");
const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const profileRoutes = require("./routes/profileRoutes");
const counselorRoutes = require("./routes/counselorRoutes");
const recommendationRoutes = require("./routes/recommendationRoutes");
const universityRoutes = require("./routes/universityRoutes");
const adminRoutes = require("./routes/adminRoutes");
const prisma = require("./prisma/client");

const app = express();
const PORT = process.env.PORT || 4000;

const DEFAULT_ADMIN_EMAIL =
  process.env.DEFAULT_ADMIN_EMAIL || "admin@gmail.com";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "Test123@";
const DEFAULT_ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME || "System Admin";

const ADMIN_DB_GUARD_CACHE_MS = 5000;
let adminDbAvailable = true;
let lastAdminDbCheckAt = 0;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/counselor", counselorRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/universities", universityRoutes);
app.use("/api/admin", async (_req, res, next) => {
  const now = Date.now();

  if (now - lastAdminDbCheckAt > ADMIN_DB_GUARD_CACHE_MS) {
    lastAdminDbCheckAt = now;
    try {
      await prisma.$queryRaw`SELECT 1`;
      adminDbAvailable = true;
    } catch {
      adminDbAvailable = false;
    }
  }

  if (!adminDbAvailable) {
    return res.status(503).json({
      status: "error",
      message: "Database is temporarily unavailable. Please try again shortly.",
    });
  }

  return next();
});
app.use("/api/admin", adminRoutes);

// Backward-compatible aliases for previous standalone recommendation service paths.
app.use("/recommendations", recommendationRoutes);
app.use("/universities", universityRoutes);

// Health check
app.get("/", (req, res) =>
  res.json({
    status: "success",
    message: "Study Advisor Backend API is running ✅",
    version: "1.0.0",
  }),
);

async function ensureDefaultAdminAccount() {
  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

  try {
    await prisma.user.upsert({
      where: { email: DEFAULT_ADMIN_EMAIL },
      update: {
        fullName: DEFAULT_ADMIN_NAME,
        role: "admin",
        password: hashedPassword,
      },
      create: {
        fullName: DEFAULT_ADMIN_NAME,
        email: DEFAULT_ADMIN_EMAIL,
        role: "admin",
        password: hashedPassword,
      },
    });
    console.log("Default admin account verified.");
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("Can't reach database server")) {
      console.warn(
        "Skipping default admin seed because database is unreachable.",
      );
      return;
    }
    throw error;
  }
}

async function startServer() {
  await ensureDefaultAdminAccount().catch((err) => {
    console.error("Default admin bootstrap error:", err.message);
  });

  try {
    const chatModule = await import("./routes/chat.mjs");
    app.use("/api/chat", chatModule.default);
    console.log("JSON knowledge chat mounted at POST /api/chat");
  } catch (err) {
    console.error("Could not load chat routes (routes/chat.mjs):", err.message);
  }

  // 404 handler (must be after all routes)
  app.use((req, res, next) => {
    res.status(404).json({
      status: "error",
      message: "API endpoint not found",
      path: req.originalUrl,
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
