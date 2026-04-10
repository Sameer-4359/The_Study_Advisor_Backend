const prisma = require("../prisma/client");

const REQUIRED_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "phoneNumber",
  "dateOfBirth",
  "nationality",
  "currentEducationLevel",
  "institutionName",
  "fieldOfStudy",
  "desiredProgram",
  "preferredCountry",
  "preferredIntake",
];

const DOCUMENT_LABELS = {
  ACADEMIC_TRANSCRIPT: "Academic Transcript",
  DEGREE_DIPLOMA: "Degree/Diploma",
  LANGUAGE_PROFICIENCY: "Language Proficiency",
  PASSPORT_COPY: "Passport Copy",
  RESUME_CV: "Resume/CV",
  STATEMENT_OF_PURPOSE: "Statement of Purpose",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toTitle = (value) => {
  if (!value) return "Not specified";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getProfileCompletion = (profile) => {
  if (!profile) {
    return 0;
  }

  const completed = REQUIRED_PROFILE_FIELDS.filter((field) => {
    const fieldValue = profile[field];
    return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
  }).length;

  return Math.round((completed / REQUIRED_PROFILE_FIELDS.length) * 100);
};

const getDerivedStatus = ({ completion, documentCount }) => {
  if (completion >= 90 && documentCount >= 4) {
    return "Completed";
  }

  if (completion < 50 || documentCount === 0) {
    return "Review Needed";
  }

  return "Active";
};

const getProgressScore = ({ completion, documentCount }) => {
  const documentCoverage = Math.round(
    (documentCount / Object.keys(DOCUMENT_LABELS).length) * 100,
  );
  return clamp(Math.round(completion * 0.7 + documentCoverage * 0.3), 0, 100);
};

const getDisplayName = (user, profile) => {
  const fullName =
    `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();
  return fullName || user.fullName;
};

const getCountry = (profile) =>
  profile?.nationality || profile?.preferredCountry || "Not specified";

const getProgram = (profile) => {
  if (!profile?.desiredProgram) {
    return "Not selected";
  }

  const studyMode = profile.studyMode ? ` (${toTitle(profile.studyMode)})` : "";
  return `${toTitle(profile.desiredProgram)}${studyMode}`;
};

const getMissingDocumentHints = (documents) => {
  const uploadedTypes = new Set(documents.map((doc) => doc.type));

  return Object.entries(DOCUMENT_LABELS)
    .filter(([type]) => !uploadedTypes.has(type))
    .map(([, label]) => label);
};

const toCounselorStudent = (user) => {
  const profile = user.userProfile;
  const documentCount = user.documents.length;
  const completion = getProfileCompletion(profile);
  const progress = getProgressScore({ completion, documentCount });
  const status = getDerivedStatus({ completion, documentCount });
  const missingDocumentHints = getMissingDocumentHints(user.documents);

  return {
    id: user.id,
    fullName: getDisplayName(user, profile),
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    lastActivityAt: profile?.updatedAt || user.createdAt,
    status,
    progress,
    profileCompletion: completion,
    program: getProgram(profile),
    country: getCountry(profile),
    gpa: profile?.cgpa,
    ieltsScore: profile?.ieltsScore,
    phoneNumber: profile?.phoneNumber || null,
    educationLevel: profile?.currentEducationLevel || null,
    preferredCountry: profile?.preferredCountry || null,
    preferredIntake: profile?.preferredIntake || null,
    documentCount,
    documents: user.documents,
    missingDocumentHints,
  };
};

const buildSummary = (students) => {
  const summary = {
    total: students.length,
    active: 0,
    reviewNeeded: 0,
    completed: 0,
    availablePrograms: [],
  };

  const programs = new Set();

  students.forEach((student) => {
    if (student.status === "Active") summary.active += 1;
    if (student.status === "Review Needed") summary.reviewNeeded += 1;
    if (student.status === "Completed") summary.completed += 1;
    if (student.program && student.program !== "Not selected") {
      programs.add(student.program);
    }
  });

  summary.availablePrograms = Array.from(programs).sort((a, b) =>
    a.localeCompare(b),
  );
  return summary;
};

exports.getCounselorStudents = async (req, res) => {
  try {
    const counselorId = Number(req.user?.id);
    if (Number.isNaN(counselorId) || counselorId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized counselor",
      });
    }

    const {
      q = "",
      status,
      program,
      page: pageInput = "1",
      limit: limitInput = "50",
    } = req.query;

    const page = Math.max(parseInt(pageInput, 10) || 1, 1);
    const limit = clamp(parseInt(limitInput, 10) || 50, 1, 200);

    const where = {
      role: "student",
      studentAssignment: {
        some: {
          counselorId,
          status: "ACTIVE",
        },
      },
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              {
                userProfile: {
                  is: {
                    desiredProgram: { contains: q, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
      ...(program && program !== "all"
        ? {
            userProfile: {
              is: {
                desiredProgram: { contains: program, mode: "insensitive" },
              },
            },
          }
        : {}),
    };

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        userProfile: true,
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            fileUrl: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    let students = users.map(toCounselorStudent);

    if (status && status !== "all") {
      students = students.filter(
        (student) =>
          student.status.toLowerCase() === String(status).toLowerCase(),
      );
    }

    const summary = buildSummary(students);

    const start = (page - 1) * limit;
    const paginatedStudents = students.slice(start, start + limit);

    return res.status(200).json({
      status: "success",
      message: "Counselor students retrieved successfully",
      students: paginatedStudents,
      summary,
      pagination: {
        page,
        limit,
        total: students.length,
        totalPages: Math.ceil(students.length / limit) || 1,
      },
    });
  } catch (err) {
    console.error("GET_COUNSELOR_STUDENTS_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve counselor students",
    });
  }
};

exports.getCounselorStudentById = async (req, res) => {
  try {
    const counselorId = Number(req.user?.id);
    if (Number.isNaN(counselorId) || counselorId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized counselor",
      });
    }

    const studentId = parseInt(req.params.id, 10);

    if (Number.isNaN(studentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid student id",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: "student",
        studentAssignment: {
          some: {
            counselorId,
            status: "ACTIVE",
          },
        },
      },
      include: {
        userProfile: true,
        documents: {
          select: {
            id: true,
            type: true,
            fileName: true,
            fileUrl: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Counselor student retrieved successfully",
      student: toCounselorStudent(user),
    });
  } catch (err) {
    console.error("GET_COUNSELOR_STUDENT_BY_ID_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve student",
    });
  }
};

exports.getCounselorStudentActivities = async (req, res) => {
  try {
    const counselorId = Number(req.user?.id);
    if (Number.isNaN(counselorId) || counselorId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized counselor",
      });
    }

    const studentId = parseInt(req.params.id, 10);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 30, 1),
      200,
    );

    if (Number.isNaN(studentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid student id",
      });
    }

    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: "student",
        studentAssignment: {
          some: {
            counselorId,
            status: "ACTIVE",
          },
        },
      },
      select: { id: true },
    });

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    const activities = await prisma.studentActivityEvent.findMany({
      where: { studentId },
      include: {
        actor: {
          select: { id: true, fullName: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.status(200).json({
      status: "success",
      activities,
    });
  } catch (err) {
    console.error("GET_COUNSELOR_STUDENT_ACTIVITIES_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve student activities",
    });
  }
};
