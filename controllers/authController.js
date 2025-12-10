// controllers/authController.js - Add this after user creation
const prisma = require("../prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

// -------- Signup -----------
exports.register = async (req, res) => {
  try {
    const { fullName, email, password, role = "student" } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "All fields are required.",
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with empty profile
    const user = await prisma.user.create({
      data: { 
        fullName, 
        email, 
        password: hashedPassword,
        role 
      },
    });

    // Create empty user profile
   await prisma.userProfile.create({
  data: {
    userId: user.id, // This links the profile to the user
    // Other fields are null by default
  }
});

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" } // Increased to 7 days for better UX
    );

    return res.status(201).json({
      status: "success",
      message: "User registered successfully. Please complete your profile.",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("SIGNUP_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error.",
    });
  }
};

// -------- Login -----------
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required.",
      });
    }

    const user = await prisma.user.findUnique({ 
      where: { email },
      include: {
        userProfile: true
      }
    });

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials.",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        status: "error",
        message: "Invalid credentials.",
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      status: "success",
      message: "Login successful",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        hasProfile: !!user.userProfile,
        profileCompletion: user.userProfile ? 
          calculateProfileCompletion(user.userProfile) : 0
      },
    });
  } catch (err) {
    console.error("LOGIN_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error.",
    });
  }
};

// Helper function to calculate profile completion
function calculateProfileCompletion(profile) {
  const fields = [
    'firstName', 'lastName', 'phoneNumber', 'dateOfBirth', 'nationality',
    'currentEducationLevel', 'institutionName', 'fieldOfStudy',
    'desiredProgram', 'preferredCountry', 'preferredIntake'
  ];

  const completedFields = fields.filter(field => 
    profile[field] !== null && profile[field] !== undefined && profile[field] !== ''
  );

  return Math.round((completedFields.length / fields.length) * 100);
}