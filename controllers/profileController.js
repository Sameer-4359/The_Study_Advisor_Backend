// controllers/profileController.js
const prisma = require("../prisma/client");

// Validation functions
const validateEducationProgression = (currentLevel, desiredProgram) => {
  const educationOrder = {
    'HIGH_SCHOOL': 1,
    'BACHELORS': 2,
    'MASTERS': 3,
    'PHD': 4,
    'POST_DOCTORAL': 5
  };

  const programOrder = {
    'BACHELORS': 1,
    'MASTERS': 2,
    'PHD': 3,
    'POST_DOCTORAL': 4
  };

  if (currentLevel && desiredProgram) {
    const currentLevelOrder = educationOrder[currentLevel.toUpperCase()] || 0;
    const desiredProgramOrder = programOrder[desiredProgram.toUpperCase()] || 0;
    
    // Allow same or higher level
    if (desiredProgramOrder < currentLevelOrder) {
      return false;
    }
  }
  return true;
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true
          }
        }
      }
    });

    if (!profile) {
      return res.status(200).json({
        status: "success",
        message: "Profile not found. Please complete your profile.",
        profile: null
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Profile retrieved successfully",
      profile
    });
  } catch (err) {
    console.error("GET_PROFILE_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve profile",
    });
  }
};

// Create or update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      // Personal Info
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      nationality,
      gender,
      
      // Academic Info
      currentEducationLevel,
      institutionName,
      fieldOfStudy,
      ieltsScore,
      cgpa,
      academicYear,
      
      // Study Preferences
      desiredProgram,
      preferredCountry,
      budgetRangeMin,
      budgetRangeMax,
      preferredIntake,
      studyMode,
      
      // Additional Info
      workExperience,
      researchExperience,
      publications
    } = req.body;

    // Validate education progression
    if (currentEducationLevel && desiredProgram) {
      const isValidProgression = validateEducationProgression(
        currentEducationLevel, 
        desiredProgram
      );
      
      if (!isValidProgression) {
        return res.status(400).json({
          status: "error",
          message: "Invalid education progression. You cannot apply for a program lower than your current education level."
        });
      }
    }

    // Validate IELTS score
    if (ieltsScore && (ieltsScore < 0 || ieltsScore > 9)) {
      return res.status(400).json({
        status: "error",
        message: "IELTS score must be between 0 and 9"
      });
    }

    // Validate CGPA
    if (cgpa && (cgpa < 0 || cgpa > 4.0)) {
      return res.status(400).json({
        status: "error",
        message: "CGPA must be between 0 and 4.0"
      });
    }

    // Validate budget range
    if (budgetRangeMin && budgetRangeMax && budgetRangeMin > budgetRangeMax) {
      return res.status(400).json({
        status: "error",
        message: "Minimum budget cannot be greater than maximum budget"
      });
    }

    // Parse date if provided
    let parsedDateOfBirth = null;
    if (dateOfBirth) {
      parsedDateOfBirth = new Date(dateOfBirth);
      if (isNaN(parsedDateOfBirth.getTime())) {
        return res.status(400).json({
          status: "error",
          message: "Invalid date format for date of birth"
        });
      }
    }

    // Check if profile exists
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId }
    });

    let profile;
    
    if (existingProfile) {
      // Update existing profile
      profile = await prisma.userProfile.update({
        where: { userId },
        data: {
          // Personal Info
          firstName: firstName || existingProfile.firstName,
          lastName: lastName || existingProfile.lastName,
          phoneNumber: phoneNumber || existingProfile.phoneNumber,
          dateOfBirth: parsedDateOfBirth || existingProfile.dateOfBirth,
          nationality: nationality || existingProfile.nationality,
          gender: gender || existingProfile.gender,
          
          // Academic Info
          currentEducationLevel: currentEducationLevel || existingProfile.currentEducationLevel,
          institutionName: institutionName || existingProfile.institutionName,
          fieldOfStudy: fieldOfStudy || existingProfile.fieldOfStudy,
          ieltsScore: ieltsScore ? parseFloat(ieltsScore) : existingProfile.ieltsScore,
          cgpa: cgpa ? parseFloat(cgpa) : existingProfile.cgpa,
          academicYear: academicYear || existingProfile.academicYear,
          
          // Study Preferences
          desiredProgram: desiredProgram || existingProfile.desiredProgram,
          preferredCountry: preferredCountry || existingProfile.preferredCountry,
          budgetRangeMin: budgetRangeMin || existingProfile.budgetRangeMin,
          budgetRangeMax: budgetRangeMax || existingProfile.budgetRangeMax,
          preferredIntake: preferredIntake || existingProfile.preferredIntake,
          studyMode: studyMode || existingProfile.studyMode,
          
          // Additional Info
          workExperience: workExperience || existingProfile.workExperience,
          researchExperience: researchExperience || existingProfile.researchExperience,
          publications: publications || existingProfile.publications
        }
      });
    } else {
      // Create new profile
      profile = await prisma.userProfile.create({
        data: {
          userId,
          // Personal Info
          firstName,
          lastName,
          phoneNumber,
          dateOfBirth: parsedDateOfBirth,
          nationality,
          gender,
          
          // Academic Info
          currentEducationLevel,
          institutionName,
          fieldOfStudy,
          ieltsScore: ieltsScore ? parseFloat(ieltsScore) : null,
          cgpa: cgpa ? parseFloat(cgpa) : null,
          academicYear,
          
          // Study Preferences
          desiredProgram,
          preferredCountry,
          budgetRangeMin,
          budgetRangeMax,
          preferredIntake,
          studyMode,
          
          // Additional Info
          workExperience,
          researchExperience,
          publications
        }
      });
    }

    return res.status(200).json({
      status: "success",
      message: existingProfile ? "Profile updated successfully" : "Profile created successfully",
      profile
    });
  } catch (err) {
    console.error("UPDATE_PROFILE_ERROR:", err);
    
    if (err.code === 'P2002') {
      return res.status(400).json({
        status: "error",
        message: "Profile already exists for this user"
      });
    }
    
    return res.status(500).json({
      status: "error",
      message: "Failed to update profile",
    });
  }
};

// Delete user profile
exports.deleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if profile exists
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId }
    });

    if (!existingProfile) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found"
      });
    }

    await prisma.userProfile.delete({
      where: { userId }
    });

    return res.status(200).json({
      status: "success",
      message: "Profile deleted successfully"
    });
  } catch (err) {
    console.error("DELETE_PROFILE_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete profile",
    });
  }
};

// Get profile completion percentage
exports.getProfileCompletion = async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await prisma.userProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return res.status(200).json({
        status: "success",
        completionPercentage: 0,
        completedFields: [],
        missingFields: [
          'firstName', 'lastName', 'phoneNumber', 'dateOfBirth', 'nationality',
          'currentEducationLevel', 'institutionName', 'fieldOfStudy',
          'desiredProgram', 'preferredCountry', 'preferredIntake'
        ]
      });
    }

    // Define required fields and their weights
    const fields = [
      { key: 'firstName', weight: 5 },
      { key: 'lastName', weight: 5 },
      { key: 'phoneNumber', weight: 5 },
      { key: 'dateOfBirth', weight: 5 },
      { key: 'nationality', weight: 5 },
      { key: 'currentEducationLevel', weight: 10 },
      { key: 'institutionName', weight: 10 },
      { key: 'fieldOfStudy', weight: 10 },
      { key: 'ieltsScore', weight: 5 },
      { key: 'cgpa', weight: 10 },
      { key: 'desiredProgram', weight: 10 },
      { key: 'preferredCountry', weight: 10 },
      { key: 'preferredIntake', weight: 5 },
      { key: 'studyMode', weight: 5 }
    ];

    let totalWeight = 0;
    let completedWeight = 0;
    const completedFields = [];
    const missingFields = [];

    fields.forEach(field => {
      totalWeight += field.weight;
      
      if (profile[field.key] !== null && profile[field.key] !== undefined && profile[field.key] !== '') {
        completedWeight += field.weight;
        completedFields.push(field.key);
      } else {
        missingFields.push(field.key);
      }
    });

    const completionPercentage = Math.round((completedWeight / totalWeight) * 100);

    return res.status(200).json({
      status: "success",
      completionPercentage,
      completedFields,
      missingFields,
      profileSummary: {
        personalInfoCompleted: profile.firstName && profile.lastName && profile.phoneNumber,
        academicInfoCompleted: profile.currentEducationLevel && profile.institutionName,
        preferencesCompleted: profile.desiredProgram && profile.preferredCountry
      }
    });
  } catch (err) {
    console.error("PROFILE_COMPLETION_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to calculate profile completion",
    });
  }
};

// Get countries list (static data)
exports.getCountries = async (req, res) => {
  try {
    const countries = [
      "United States", "United Kingdom", "Canada", "Australia", "Germany",
      "France", "Netherlands", "Sweden", "Norway", "Denmark",
      "Switzerland", "Ireland", "New Zealand", "Singapore", "Malaysia",
      "Japan", "South Korea", "China", "Italy", "Spain", "Pakistan"
    ].sort();

    return res.status(200).json({
      status: "success",
      countries
    });
  } catch (err) {
    console.error("GET_COUNTRIES_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve countries list",
    });
  }
};

// Get education levels
exports.getEducationLevels = async (req, res) => {
  try {
    const educationLevels = [
      { value: "HIGH_SCHOOL", label: "High School" },
      { value: "BACHELORS", label: "Bachelor's Degree" },
      { value: "MASTERS", label: "Master's Degree" },
      { value: "PHD", label: "PhD/Doctorate" },
      { value: "POST_DOCTORAL", label: "Post Doctoral" }
    ];

    return res.status(200).json({
      status: "success",
      educationLevels
    });
  } catch (err) {
    console.error("GET_EDUCATION_LEVELS_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve education levels",
    });
  }
};

// Get program types based on current education level
exports.getProgramsByLevel = async (req, res) => {
  try {
    const { currentLevel } = req.query;
    
    let programs = [];
    
    switch (currentLevel?.toUpperCase()) {
      case "HIGH_SCHOOL":
        programs = [
          { value: "BACHELORS", label: "Bachelor's Degree" },
          { value: "DIPLOMA", label: "Diploma/Certificate" },
          { value: "FOUNDATION", label: "Foundation Year" }
        ];
        break;
        
      case "BACHELORS":
        programs = [
          { value: "MASTERS", label: "Master's Degree" },
          { value: "PG_DIPLOMA", label: "Postgraduate Diploma" },
          { value: "MBA", label: "MBA" }
        ];
        break;
        
      case "MASTERS":
        programs = [
          { value: "PHD", label: "PhD/Doctorate" },
          { value: "RESEARCH_MASTERS", label: "Research Master's" },
          { value: "EXECUTIVE_EDUCATION", label: "Executive Education" }
        ];
        break;
        
      case "PHD":
        programs = [
          { value: "POST_DOCTORAL", label: "Post Doctoral" },
          { value: "RESEARCH_FELLOWSHIP", label: "Research Fellowship" }
        ];
        break;
        
      default:
        programs = [
          { value: "BACHELORS", label: "Bachelor's Degree" },
          { value: "MASTERS", label: "Master's Degree" },
          { value: "PHD", label: "PhD/Doctorate" },
          { value: "DIPLOMA", label: "Diploma/Certificate" },
          { value: "EXCHANGE", label: "Exchange Program" }
        ];
    }

    return res.status(200).json({
      status: "success",
      programs
    });
  } catch (err) {
    console.error("GET_PROGRAMS_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve programs",
    });
  }
};