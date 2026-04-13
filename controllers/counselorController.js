const prisma = require("../prisma/client");
const recommendationService = require("../services/recommendation.service");

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

const DOCUMENT_REVIEW_STATUSES = [
  "Pending",
  "Approved",
  "Reupload Requested",
  "Rejected",
];

const UNIVERSITY_STATUSES = [
  "Considering",
  "Shortlisted",
  "Applied",
  "Offer Received",
  "Rejected",
];

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

const parseJsonMetadata = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
};

const normalizeDocumentReviewStatus = (value) => {
  if (!value) return "Pending";
  const normalized = String(value).trim().toLowerCase();

  if (normalized === "approved") return "Approved";
  if (normalized === "reupload requested") return "Reupload Requested";
  if (normalized === "reupload_requested") return "Reupload Requested";
  if (normalized === "rejected") return "Rejected";
  return "Pending";
};

const parseRequestedDocumentReviewStatus = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  if (normalized === "pending") return "Pending";
  if (normalized === "approved") return "Approved";
  if (normalized === "reupload requested") return "Reupload Requested";
  if (normalized === "reupload_requested") return "Reupload Requested";
  if (normalized === "rejected") return "Rejected";

  return null;
};

const getDocumentReviewMap = async (studentId) => {
  const events = await prisma.studentActivityEvent.findMany({
    where: {
      studentId,
      eventType: "DOCUMENT_UPDATED",
    },
    include: {
      actor: {
        select: {
          id: true,
          fullName: true,
          role: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 300,
  });

  const reviewMap = new Map();

  events.forEach((event) => {
    const metadata = parseJsonMetadata(event.metadata);
    if (!metadata || metadata.kind !== "DOCUMENT_REVIEW") {
      return;
    }

    const documentId = Number(metadata.documentId);
    if (!Number.isInteger(documentId) || documentId < 1) {
      return;
    }

    if (reviewMap.has(documentId)) {
      return;
    }

    const verificationStatus = normalizeDocumentReviewStatus(
      metadata.verificationStatus,
    );

    reviewMap.set(documentId, {
      verificationStatus,
      reviewedAt: event.createdAt,
      reviewedBy:
        event.actor && event.actor.role
          ? {
              id: event.actor.id,
              fullName: event.actor.fullName,
              role: event.actor.role,
            }
          : null,
      reviewNote:
        typeof metadata.note === "string" && metadata.note.trim()
          ? metadata.note.trim()
          : null,
    });
  });

  return reviewMap;
};

const getUniversityStatusMap = async (studentId) => {
  const events = await prisma.studentActivityEvent.findMany({
    where: {
      studentId,
      eventType: "PROFILE_UPDATED",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 300,
  });

  const statusMap = new Map();

  events.forEach((event) => {
    const metadata = parseJsonMetadata(event.metadata);
    if (!metadata || metadata.kind !== "UNIVERSITY_STATUS_UPDATE") {
      return;
    }

    const universityId = Number(metadata.universityId);
    if (!Number.isInteger(universityId) || universityId < 1) {
      return;
    }

    if (statusMap.has(universityId)) {
      return;
    }

    const requestedStatus = String(metadata.status || "");
    const status = UNIVERSITY_STATUSES.includes(requestedStatus)
      ? requestedStatus
      : "Considering";

    statusMap.set(universityId, {
      status,
      updatedAt: event.createdAt,
      note:
        typeof metadata.note === "string" && metadata.note.trim()
          ? metadata.note.trim()
          : null,
    });
  });

  return statusMap;
};

const buildRecommendationProfile = (profile) => {
  if (!profile) {
    return null;
  }

  const recommendationProfile = {
    gpa:
      profile.cgpa !== null && profile.cgpa !== undefined
        ? Number(profile.cgpa)
        : null,
    ielts_score:
      profile.ieltsScore !== null && profile.ieltsScore !== undefined
        ? Number(profile.ieltsScore)
        : null,
    current_education_level: profile.currentEducationLevel || null,
    field_of_study: profile.fieldOfStudy || "",
    desired_program: profile.desiredProgram || null,
    preferred_countries: profile.preferredCountry
      ? [profile.preferredCountry]
      : [],
    budget_usd:
      profile.budgetRangeMax !== null && profile.budgetRangeMax !== undefined
        ? Number(profile.budgetRangeMax)
        : null,
    experience_years:
      profile.workExperience !== null && profile.workExperience !== undefined
        ? Number(profile.workExperience)
        : 0,
    research_experience: Boolean(profile.researchExperience),
    publications_count:
      profile.publications !== null && profile.publications !== undefined
        ? Number(profile.publications)
        : 0,
    work_experience_relevant:
      profile.workExperience !== null && profile.workExperience !== undefined
        ? Number(profile.workExperience) > 0
        : false,
    leadership_experience: false,
  };

  if (
    recommendationProfile.gpa === null ||
    !recommendationProfile.current_education_level ||
    !recommendationProfile.desired_program
  ) {
    return null;
  }

  const validationError = recommendationService.validateStudentProfile(
    recommendationProfile,
  );

  if (validationError) {
    return null;
  }

  return recommendationProfile;
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
      role: { equals: "student", mode: "insensitive" },
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
        role: { equals: "student", mode: "insensitive" },
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

    const student = toCounselorStudent(user);
    const reviewMap = await getDocumentReviewMap(studentId);

    student.documents = student.documents.map((doc) => {
      const review = reviewMap.get(doc.id);
      return {
        ...doc,
        verificationStatus: review?.verificationStatus || "Pending",
        reviewedAt: review?.reviewedAt || null,
        reviewNote: review?.reviewNote || null,
        reviewedBy: review?.reviewedBy || null,
      };
    });

    return res.status(200).json({
      status: "success",
      message: "Counselor student retrieved successfully",
      student,
    });
  } catch (err) {
    console.error("GET_COUNSELOR_STUDENT_BY_ID_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve student",
    });
  }
};

exports.getCounselorStudentLatestSop = async (req, res) => {
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

    const assignedStudent = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: { equals: "student", mode: "insensitive" },
        studentAssignment: {
          some: {
            counselorId,
            status: "ACTIVE",
          },
        },
      },
      select: { id: true },
    });

    if (!assignedStudent) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    const sop = await prisma.statementOfPurpose.findFirst({
      where: {
        userId: studentId,
      },
      include: {
        reviewer: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
        document: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            createdAt: true,
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });

    return res.status(200).json({
      status: "success",
      sop,
    });
  } catch (err) {
    console.error("GET_COUNSELOR_STUDENT_LATEST_SOP_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve student SOP",
    });
  }
};

exports.getCounselorStudentUniversities = async (req, res) => {
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

    const topK = clamp(parseInt(req.query.topK, 10) || 5, 1, 20);

    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: { equals: "student", mode: "insensitive" },
        studentAssignment: {
          some: {
            counselorId,
            status: "ACTIVE",
          },
        },
      },
      include: {
        userProfile: true,
      },
    });

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    const recommendationProfile = buildRecommendationProfile(
      student.userProfile,
    );

    if (!recommendationProfile) {
      return res.status(200).json({
        status: "success",
        universities: [],
        message: "Student profile is incomplete for university recommendations",
      });
    }

    const recommendationResult = await recommendationService.getRecommendations(
      recommendationProfile,
      topK,
    );

    const universityStatusMap = await getUniversityStatusMap(studentId);

    const universities = recommendationResult.recommendations.map((item) => {
      const uni = item.university;
      const persistedStatus = universityStatusMap.get(uni.id);

      return {
        id: String(uni.id),
        universityId: uni.id,
        name: uni.name,
        country: uni.country,
        program: uni.program_name || uni.program_level || "Not specified",
        status: persistedStatus?.status || "Considering",
        note: persistedStatus?.note || null,
        updatedAt: persistedStatus?.updatedAt || null,
        matchScore: item.match_score,
        eligibilityScore: item.eligibility_score,
        similarityScore: item.similarity_score,
        reasons: Array.isArray(item.reasons) ? item.reasons : [],
        tuitionFeeUsd: uni.tuition_fee_usd,
        worldRanking: uni.world_ranking,
      };
    });

    return res.status(200).json({
      status: "success",
      universities,
      totalConsidered: recommendationResult.total_considered,
      algorithmVersion: recommendationResult.algorithm_version,
    });
  } catch (err) {
    console.error("GET_COUNSELOR_STUDENT_UNIVERSITIES_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve student universities",
    });
  }
};

exports.updateCounselorStudentUniversityStatus = async (req, res) => {
  try {
    const counselorId = Number(req.user?.id);
    if (Number.isNaN(counselorId) || counselorId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized counselor",
      });
    }

    const studentId = parseInt(req.params.id, 10);
    const universityId = parseInt(req.params.universityId, 10);
    const requestedStatus = String(req.body?.status || "").trim();
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

    if (Number.isNaN(studentId) || Number.isNaN(universityId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid student or university id",
      });
    }

    if (!UNIVERSITY_STATUSES.includes(requestedStatus)) {
      return res.status(400).json({
        status: "error",
        message: `status must be one of: ${UNIVERSITY_STATUSES.join(", ")}`,
      });
    }

    if (note.length > 1000) {
      return res.status(400).json({
        status: "error",
        message: "Note cannot exceed 1000 characters",
      });
    }

    const assignedStudent = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: { equals: "student", mode: "insensitive" },
        studentAssignment: {
          some: {
            counselorId,
            status: "ACTIVE",
          },
        },
      },
      select: { id: true },
    });

    if (!assignedStudent) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    const university =
      await recommendationService.getUniversityById(universityId);
    if (!university) {
      return res.status(404).json({
        status: "error",
        message: "University not found",
      });
    }

    const event = await prisma.studentActivityEvent.create({
      data: {
        studentId,
        actorId: counselorId,
        eventType: "PROFILE_UPDATED",
        description: `Counselor updated university '${university.name}' status to ${requestedStatus}`,
        metadata: {
          kind: "UNIVERSITY_STATUS_UPDATE",
          universityId,
          status: requestedStatus,
          note: note || null,
          universityName: university.name,
        },
      },
    });

    return res.status(200).json({
      status: "success",
      message: "University status updated",
      university: {
        id: String(university.id),
        universityId,
        name: university.name,
        country: university.country,
        program: university.program_name || university.program_level,
        status: requestedStatus,
        note: note || null,
        updatedAt: event.createdAt,
      },
    });
  } catch (err) {
    console.error("UPDATE_COUNSELOR_STUDENT_UNIVERSITY_STATUS_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to update university status",
    });
  }
};

exports.updateCounselorStudentDocumentReview = async (req, res) => {
  try {
    const counselorId = Number(req.user?.id);
    if (Number.isNaN(counselorId) || counselorId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized counselor",
      });
    }

    const studentId = parseInt(req.params.id, 10);
    const documentId = parseInt(req.params.documentId, 10);
    const rawStatus = String(req.body?.verificationStatus || "").trim();
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

    if (Number.isNaN(studentId) || Number.isNaN(documentId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid student or document id",
      });
    }

    const verificationStatus = parseRequestedDocumentReviewStatus(rawStatus);
    if (!verificationStatus) {
      return res.status(400).json({
        status: "error",
        message: `verificationStatus must be one of: ${DOCUMENT_REVIEW_STATUSES.join(
          ", ",
        )}`,
      });
    }

    if (note.length > 1000) {
      return res.status(400).json({
        status: "error",
        message: "Note cannot exceed 1000 characters",
      });
    }

    const assignedStudent = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: { equals: "student", mode: "insensitive" },
        studentAssignment: {
          some: {
            counselorId,
            status: "ACTIVE",
          },
        },
      },
      select: { id: true },
    });

    if (!assignedStudent) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId: studentId,
      },
      select: {
        id: true,
        type: true,
        fileUrl: true,
      },
    });

    if (!document) {
      return res.status(404).json({
        status: "error",
        message: "Document not found for this student",
      });
    }

    if (verificationStatus === "Approved" && !document.fileUrl) {
      return res.status(400).json({
        status: "error",
        message: "Document cannot be approved because file is missing",
      });
    }

    const event = await prisma.studentActivityEvent.create({
      data: {
        studentId,
        actorId: counselorId,
        eventType: "DOCUMENT_UPDATED",
        description: `Counselor marked ${document.type} as ${verificationStatus}`,
        metadata: {
          kind: "DOCUMENT_REVIEW",
          documentId: document.id,
          verificationStatus,
          note: note || null,
          documentType: document.type,
        },
      },
      include: {
        actor: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    return res.status(200).json({
      status: "success",
      message: "Document review updated",
      review: {
        documentId: document.id,
        verificationStatus,
        reviewNote: note || null,
        reviewedAt: event.createdAt,
        reviewedBy: event.actor || null,
      },
    });
  } catch (err) {
    console.error("UPDATE_COUNSELOR_STUDENT_DOCUMENT_REVIEW_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to update document review",
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
        role: { equals: "student", mode: "insensitive" },
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
