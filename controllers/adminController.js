const bcrypt = require("bcrypt");
const { Prisma } = require("@prisma/client");
const prisma = require("../prisma/client");

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toDateBucket = (date) => {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (bucket) => {
  const [year, month] = bucket.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleString("en-US", { month: "short" });
};

const getLastMonthBuckets = (months = 6) => {
  const now = new Date();
  const result = [];

  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    result.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }

  return result;
};

const normalizeSkills = (skills) => {
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills.map((item) => String(item).trim()).filter(Boolean);
};

const mapCounselor = (user, assignedStudents = 0) => ({
  id: user.id,
  name: user.fullName,
  email: user.email,
  phone: user.counselorProfile?.phone || "",
  capacity: user.counselorProfile?.capacity ?? 20,
  skills: user.counselorProfile?.skills || [],
  joined: user.createdAt,
  isActive: user.counselorProfile?.isActive ?? true,
  assignedStudents,
});

const toRoleLabel = (role) => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const toActor = (entity, fallbackRole = "system") => ({
  name: entity?.fullName || "System",
  email: entity?.email || null,
  role: toRoleLabel(entity?.role || fallbackRole),
});

const toSubject = (entity) => {
  if (!entity) return null;

  return {
    name: entity.fullName,
    email: entity.email || null,
    role: toRoleLabel(entity.role),
  };
};

exports.getDashboardSummary = async (_req, res) => {
  try {
    const [
      totalStudents,
      totalCounselors,
      totalDocuments,
      totalSops,
      assignedStudents,
      universitiesAgg,
      pendingConnectionRequests,
    ] = await Promise.all([
      prisma.user.count({
        where: { role: { equals: "student", mode: "insensitive" } },
      }),
      prisma.user.count({
        where: { role: { equals: "counselor", mode: "insensitive" } },
      }),
      prisma.document.count(),
      prisma.statementOfPurpose.count(),
      prisma.counselorStudentAssignment.count({ where: { status: "ACTIVE" } }),
      prisma.$queryRaw(
        Prisma.sql`
          SELECT
            COUNT(*)::int AS total,
            SUM(CASE WHEN COALESCE(is_partnered, false) THEN 1 ELSE 0 END)::int AS partnered
          FROM universities
        `,
      ),
      prisma.counselorNotification
        .findMany({
          where: {
            isRead: false,
            title: { startsWith: "[CONNECT_REQUEST]" },
            studentId: { not: null },
            counselor: {
              role: { equals: "admin", mode: "insensitive" },
            },
          },
          select: { studentId: true },
          distinct: ["studentId"],
        })
        .then((rows) => rows.length),
    ]);

    const totalUniversities = Number(universitiesAgg?.[0]?.total || 0);
    const partneredUniversities = Number(universitiesAgg?.[0]?.partnered || 0);

    return res.json({
      students: {
        total: totalStudents,
        assigned: assignedStudents,
        unassigned: Math.max(0, totalStudents - assignedStudents),
      },
      counselors: {
        total: totalCounselors,
      },
      universities: {
        total: totalUniversities,
        partnered: partneredUniversities,
      },
      documents: {
        total: totalDocuments,
      },
      sop: {
        total: totalSops,
      },
      applications: {
        total: assignedStudents,
      },
      connections: {
        pendingRequests: pendingConnectionRequests,
      },
    });
  } catch (error) {
    console.error("ADMIN_DASHBOARD_SUMMARY_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch dashboard summary",
    });
  }
};

exports.getDashboardMonthlyTrends = async (_req, res) => {
  try {
    const [studentRows, assignmentRows, documentRows] = await Promise.all([
      prisma.$queryRaw(
        Prisma.sql`
          SELECT DATE_TRUNC('month', "createdAt") AS month_start, COUNT(*)::int AS total
          FROM "User"
          WHERE LOWER(role) = 'student'
          GROUP BY DATE_TRUNC('month', "createdAt")
          ORDER BY month_start ASC
        `,
      ),
      prisma.$queryRaw(
        Prisma.sql`
          SELECT DATE_TRUNC('month', "assignedAt") AS month_start, COUNT(*)::int AS total
          FROM "CounselorStudentAssignment"
          WHERE status = 'ACTIVE'
          GROUP BY DATE_TRUNC('month', "assignedAt")
          ORDER BY month_start ASC
        `,
      ),
      prisma.$queryRaw(
        Prisma.sql`
          SELECT DATE_TRUNC('month', "createdAt") AS month_start, COUNT(*)::int AS total
          FROM "Document"
          GROUP BY DATE_TRUNC('month', "createdAt")
          ORDER BY month_start ASC
        `,
      ),
    ]);

    const buckets = getLastMonthBuckets(6);

    const studentMap = new Map(
      studentRows.map((row) => [
        toDateBucket(row.month_start),
        Number(row.total),
      ]),
    );
    const assignmentMap = new Map(
      assignmentRows.map((row) => [
        toDateBucket(row.month_start),
        Number(row.total),
      ]),
    );
    const documentMap = new Map(
      documentRows.map((row) => [
        toDateBucket(row.month_start),
        Number(row.total),
      ]),
    );

    const trends = buckets.map((bucket) => ({
      month: monthLabel(bucket),
      students: studentMap.get(bucket) || 0,
      applications: assignmentMap.get(bucket) || 0,
      documents: documentMap.get(bucket) || 0,
    }));

    return res.json({ trends });
  } catch (error) {
    console.error("ADMIN_DASHBOARD_TRENDS_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch monthly trends",
    });
  }
};

exports.getDashboardRecentActivity = async (_req, res) => {
  try {
    const [
      recentEvents,
      recentAssignments,
      recentCounselors,
      recentPartneredUniversities,
    ] = await Promise.all([
      prisma.studentActivityEvent.findMany({
        include: {
          actor: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          student: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
        take: 8,
        orderBy: { createdAt: "desc" },
      }),
      prisma.counselorStudentAssignment.findMany({
        where: { status: "ACTIVE" },
        include: {
          counselor: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          student: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          creator: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
        orderBy: { assignedAt: "desc" },
        take: 6,
      }),
      prisma.user.findMany({
        where: { role: { equals: "counselor", mode: "insensitive" } },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.$queryRaw(
        Prisma.sql`
            SELECT id, name, COALESCE(partnered_at, created_at) AS activity_at
            FROM universities
            WHERE COALESCE(is_partnered, false) = true
            ORDER BY COALESCE(partnered_at, created_at) DESC
            LIMIT 5
          `,
      ),
    ]);

    const feed = [];

    recentEvents.forEach((event) => {
      const actor = event.actor || event.student;
      feed.push({
        id: `event-${event.id}`,
        type: "System",
        message: event.description,
        time: event.createdAt,
        activityCode: event.eventType,
        actor: toActor(actor, "student"),
        subject: toSubject(event.student),
      });
    });

    recentAssignments.forEach((assignment) => {
      feed.push({
        id: `assignment-${assignment.id}`,
        type: "Student",
        message: `${assignment.student.fullName} assigned to ${assignment.counselor.fullName}`,
        time: assignment.assignedAt,
        activityCode: "STUDENT_ASSIGNED",
        actor: assignment.creator
          ? toActor(assignment.creator, "admin")
          : { name: "Admin", email: null, role: "Admin" },
        subject: toSubject(assignment.student),
        target: toSubject(assignment.counselor),
      });
    });

    recentCounselors.forEach((counselor) => {
      feed.push({
        id: `counselor-${counselor.id}`,
        type: "Counselor",
        message: `${counselor.fullName} joined as counselor`,
        time: counselor.createdAt,
        activityCode: "COUNSELOR_JOINED",
        actor: toActor(counselor, "counselor"),
        subject: toSubject(counselor),
      });
    });

    recentPartneredUniversities.forEach((university) => {
      feed.push({
        id: `university-${university.id}`,
        type: "University",
        message: `${university.name} marked as partnered university`,
        time: university.activity_at,
        activityCode: "UNIVERSITY_PARTNERED",
        actor: {
          name: university.name,
          email: null,
          role: "University",
        },
        subject: {
          name: university.name,
          email: null,
          role: "University",
        },
      });
    });

    feed.sort((a, b) => new Date(b.time) - new Date(a.time));

    return res.json({ activities: feed.slice(0, 20) });
  } catch (error) {
    console.error("ADMIN_RECENT_ACTIVITY_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch recent activity",
    });
  }
};

exports.getAdminNotifications = async (req, res) => {
  try {
    const adminId = Number(req.user?.id);
    if (Number.isNaN(adminId) || adminId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized admin",
      });
    }

    const { limit: limitInput = "25", unreadOnly = "false" } = req.query || {};

    const limit = Math.min(Math.max(parseInt(limitInput, 10) || 25, 1), 100);
    const onlyUnread = String(unreadOnly).toLowerCase() === "true";

    const where = {
      counselorId: adminId,
      ...(onlyUnread ? { isRead: false } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      prisma.counselorNotification.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.counselorNotification.count({
        where: { counselorId: adminId, isRead: false },
      }),
    ]);

    const notifications = items.map((item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      type: item.type,
      isRead: item.isRead,
      createdAt: item.createdAt,
      readAt: item.readAt,
      studentId: item.studentId,
      student: item.student,
      isConnectionRequest: item.title.startsWith("[CONNECT_REQUEST]"),
      actionPath: item.studentId
        ? `/admin/assign-students?studentId=${item.studentId}`
        : null,
    }));

    return res.status(200).json({
      status: "success",
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error("ADMIN_GET_NOTIFICATIONS_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch admin notifications",
    });
  }
};

exports.markAdminNotificationRead = async (req, res) => {
  try {
    const adminId = Number(req.user?.id);
    const notificationId = Number(req.params.id);

    if (Number.isNaN(adminId) || adminId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized admin",
      });
    }

    if (Number.isNaN(notificationId) || notificationId < 1) {
      return res.status(400).json({
        status: "error",
        message: "Invalid notification id",
      });
    }

    const existing = await prisma.counselorNotification.findFirst({
      where: {
        id: notificationId,
        counselorId: adminId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        status: "error",
        message: "Notification not found",
      });
    }

    const updated = await prisma.counselorNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return res.status(200).json({
      status: "success",
      notification: updated,
    });
  } catch (error) {
    console.error("ADMIN_MARK_NOTIFICATION_READ_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update notification",
    });
  }
};

exports.getCounselors = async (_req, res) => {
  try {
    const counselors = await prisma.user.findMany({
      where: { role: { equals: "counselor", mode: "insensitive" } },
      include: {
        counselorProfile: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const counselorIds = counselors.map((c) => c.id);

    const assignedRows = counselorIds.length
      ? await prisma.counselorStudentAssignment.groupBy({
          by: ["counselorId"],
          where: {
            status: "ACTIVE",
            counselorId: { in: counselorIds },
          },
          _count: {
            _all: true,
          },
        })
      : [];

    const assignedCountMap = new Map(
      assignedRows.map((row) => [row.counselorId, row._count._all]),
    );

    return res.json({
      counselors: counselors.map((counselor) =>
        mapCounselor(counselor, assignedCountMap.get(counselor.id) || 0),
      ),
    });
  } catch (error) {
    console.error("ADMIN_GET_COUNSELORS_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch counselors",
    });
  }
};

exports.createCounselor = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      phone = null,
      capacity = 20,
      skills = [],
      isActive = true,
    } = req.body || {};

    if (!fullName || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "fullName, email and password are required",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 6 characters",
      });
    }

    const existing = await prisma.user.findUnique({
      where: { email: String(email) },
    });
    if (existing) {
      return res.status(409).json({
        status: "error",
        message: "Email already in use",
      });
    }

    const normalizedCapacity = clamp(parseInt(capacity, 10) || 20, 1, 500);
    const normalizedSkills = normalizeSkills(skills);
    const hashedPassword = await bcrypt.hash(String(password), 10);

    const counselor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: String(fullName).trim(),
          email: String(email).trim().toLowerCase(),
          password: hashedPassword,
          role: "counselor",
        },
      });

      const profile = await tx.counselorProfile.create({
        data: {
          userId: user.id,
          phone: phone ? String(phone).trim() : null,
          capacity: normalizedCapacity,
          skills: normalizedSkills,
          isActive: Boolean(isActive),
        },
      });

      return { ...user, counselorProfile: profile };
    });

    return res.status(201).json({
      counselor: mapCounselor(counselor, 0),
      credentials: {
        email: counselor.email,
        role: counselor.role,
      },
    });
  } catch (error) {
    console.error("ADMIN_CREATE_COUNSELOR_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to create counselor",
    });
  }
};

exports.updateCounselor = async (req, res) => {
  try {
    const counselorId = Number(req.params.id);
    if (Number.isNaN(counselorId) || counselorId < 1) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid counselor id" });
    }

    const { fullName, email, password, phone, capacity, skills, isActive } =
      req.body || {};

    const existing = await prisma.user.findFirst({
      where: {
        id: counselorId,
        role: { equals: "counselor", mode: "insensitive" },
      },
      include: { counselorProfile: true },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ status: "error", message: "Counselor not found" });
    }

    if (
      email &&
      String(email).trim().toLowerCase() !== existing.email.toLowerCase()
    ) {
      const duplicate = await prisma.user.findUnique({
        where: { email: String(email).trim().toLowerCase() },
      });
      if (duplicate) {
        return res
          .status(409)
          .json({ status: "error", message: "Email already in use" });
      }
    }

    const userData = {};
    if (fullName !== undefined) userData.fullName = String(fullName).trim();
    if (email !== undefined)
      userData.email = String(email).trim().toLowerCase();
    if (password !== undefined && String(password).trim()) {
      if (String(password).length < 6) {
        return res.status(400).json({
          status: "error",
          message: "Password must be at least 6 characters",
        });
      }
      userData.password = await bcrypt.hash(String(password), 10);
    }

    const profileData = {};
    if (phone !== undefined)
      profileData.phone = phone ? String(phone).trim() : null;
    if (capacity !== undefined) {
      profileData.capacity = clamp(parseInt(capacity, 10) || 20, 1, 500);
    }
    if (skills !== undefined) profileData.skills = normalizeSkills(skills);
    if (isActive !== undefined) profileData.isActive = Boolean(isActive);

    const counselor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: counselorId },
        data: userData,
      });

      const profile = await tx.counselorProfile.upsert({
        where: { userId: counselorId },
        update: profileData,
        create: {
          userId: counselorId,
          phone: profileData.phone ?? null,
          capacity: profileData.capacity ?? 20,
          skills: profileData.skills ?? [],
          isActive: profileData.isActive ?? true,
        },
      });

      return { ...user, counselorProfile: profile };
    });

    const assignedCount = await prisma.counselorStudentAssignment.count({
      where: { counselorId, status: "ACTIVE" },
    });

    return res.json({ counselor: mapCounselor(counselor, assignedCount) });
  } catch (error) {
    console.error("ADMIN_UPDATE_COUNSELOR_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update counselor",
    });
  }
};

exports.deleteCounselor = async (req, res) => {
  try {
    const counselorId = Number(req.params.id);
    if (Number.isNaN(counselorId) || counselorId < 1) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid counselor id" });
    }

    const counselor = await prisma.user.findFirst({
      where: {
        id: counselorId,
        role: { equals: "counselor", mode: "insensitive" },
      },
      include: { counselorProfile: true },
    });

    if (!counselor) {
      return res
        .status(404)
        .json({ status: "error", message: "Counselor not found" });
    }

    await prisma.$transaction([
      prisma.counselorStudentAssignment.deleteMany({ where: { counselorId } }),
      prisma.counselorProfile.updateMany({
        where: { userId: counselorId },
        data: { isActive: false },
      }),
    ]);

    return res.json({
      status: "success",
      message: "Counselor disabled and assignments cleared",
    });
  } catch (error) {
    console.error("ADMIN_DELETE_COUNSELOR_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete counselor",
    });
  }
};

exports.getStudentsForAssignment = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = clamp(parseInt(req.query.limit, 10) || 20, 1, 200);

    const where = {
      role: { equals: "student", mode: "insensitive" },
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
    };

    const [total, assignedCount, students] = await Promise.all([
      prisma.user.count({ where }),
      prisma.counselorStudentAssignment.count({
        where: {
          status: "ACTIVE",
          student: where,
        },
      }),
      prisma.user.findMany({
        where,
        include: {
          userProfile: true,
          studentAssignment: {
            where: { status: "ACTIVE" },
            include: {
              counselor: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const payload = students.map((student) => {
      const assignment = student.studentAssignment[0] || null;

      return {
        id: student.id,
        name: student.fullName,
        email: student.email,
        program: student.userProfile?.desiredProgram || "Not selected",
        location:
          student.userProfile?.preferredCountry ||
          student.userProfile?.nationality ||
          "Not specified",
        date: student.createdAt,
        assignedCounselor: assignment
          ? {
              assignmentId: assignment.id,
              id: assignment.counselor.id,
              name: assignment.counselor.fullName,
              email: assignment.counselor.email,
            }
          : null,
      };
    });

    return res.json({
      students: payload,
      summary: {
        total,
        assigned: assignedCount,
        unassigned: Math.max(0, total - assignedCount),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("ADMIN_GET_STUDENTS_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch students",
    });
  }
};

exports.getStudentDetailsForAssignment = async (req, res) => {
  try {
    const studentId = Number(req.params.id);
    if (Number.isNaN(studentId) || studentId < 1) {
      return res.status(400).json({
        status: "error",
        message: "Invalid student id",
      });
    }

    const student = await prisma.user.findFirst({
      where: {
        id: studentId,
        role: { equals: "student", mode: "insensitive" },
      },
      include: {
        userProfile: true,
        documents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            type: true,
            fileName: true,
            fileUrl: true,
            createdAt: true,
          },
        },
        studentAssignment: {
          where: { status: "ACTIVE" },
          include: {
            counselor: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    const latestSop = await prisma.statementOfPurpose.findFirst({
      where: { userId: studentId },
      include: {
        document: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            createdAt: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    const assignment = student.studentAssignment[0] || null;

    return res.status(200).json({
      status: "success",
      student: {
        id: student.id,
        name: student.fullName,
        email: student.email,
        role: student.role,
        createdAt: student.createdAt,
        profile: {
          phoneNumber: student.userProfile?.phoneNumber || null,
          nationality: student.userProfile?.nationality || null,
          desiredProgram: student.userProfile?.desiredProgram || null,
          preferredCountry: student.userProfile?.preferredCountry || null,
          preferredIntake: student.userProfile?.preferredIntake || null,
          currentEducationLevel:
            student.userProfile?.currentEducationLevel || null,
          institutionName: student.userProfile?.institutionName || null,
          fieldOfStudy: student.userProfile?.fieldOfStudy || null,
          cgpa: student.userProfile?.cgpa || null,
          ieltsScore: student.userProfile?.ieltsScore || null,
          updatedAt: student.userProfile?.updatedAt || null,
        },
        assignedCounselor: assignment
          ? {
              assignmentId: assignment.id,
              assignedAt: assignment.assignedAt,
              name: assignment.counselor.fullName,
              email: assignment.counselor.email,
            }
          : null,
        documents: student.documents.map((doc) => ({
          id: doc.id,
          type: doc.type,
          fileName: doc.fileName,
          fileUrl: doc.fileUrl,
          uploadedAt: doc.createdAt,
        })),
        latestSop: latestSop
          ? {
              id: latestSop.id,
              version: latestSop.version,
              title: latestSop.title,
              status: latestSop.status,
              reviewNotes: latestSop.reviewNotes,
              submittedAt: latestSop.submittedAt,
              reviewedAt: latestSop.reviewedAt,
              updatedAt: latestSop.updatedAt,
              document: latestSop.document
                ? {
                    id: latestSop.document.id,
                    fileName: latestSop.document.fileName,
                    fileUrl: latestSop.document.fileUrl,
                    createdAt: latestSop.document.createdAt,
                  }
                : null,
              reviewer: latestSop.reviewer
                ? {
                    id: latestSop.reviewer.id,
                    fullName: latestSop.reviewer.fullName,
                    email: latestSop.reviewer.email,
                  }
                : null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("ADMIN_GET_STUDENT_DETAILS_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch student details",
    });
  }
};

exports.createAssignment = async (req, res) => {
  try {
    const { studentId, counselorId, notes = null } = req.body || {};

    const parsedStudentId = Number(studentId);
    const parsedCounselorId = Number(counselorId);

    if (
      Number.isNaN(parsedStudentId) ||
      parsedStudentId < 1 ||
      Number.isNaN(parsedCounselorId) ||
      parsedCounselorId < 1
    ) {
      return res.status(400).json({
        status: "error",
        message: "studentId and counselorId are required",
      });
    }

    const [student, counselor, counselorProfile] = await Promise.all([
      prisma.user.findFirst({
        where: {
          id: parsedStudentId,
          role: { equals: "student", mode: "insensitive" },
        },
      }),
      prisma.user.findFirst({
        where: {
          id: parsedCounselorId,
          role: { equals: "counselor", mode: "insensitive" },
        },
      }),
      prisma.counselorProfile.findUnique({
        where: { userId: parsedCounselorId },
      }),
    ]);

    if (!student) {
      return res
        .status(404)
        .json({ status: "error", message: "Student not found" });
    }

    if (!counselor) {
      return res
        .status(404)
        .json({ status: "error", message: "Counselor not found" });
    }

    if (counselorProfile && !counselorProfile.isActive) {
      return res
        .status(400)
        .json({ status: "error", message: "Counselor is inactive" });
    }

    const capacity = counselorProfile?.capacity ?? 20;
    const currentLoad = await prisma.counselorStudentAssignment.count({
      where: {
        counselorId: parsedCounselorId,
        status: "ACTIVE",
      },
    });

    const existing = await prisma.counselorStudentAssignment.findUnique({
      where: { studentId: parsedStudentId },
    });

    const alreadyAssignedToSameCounselor =
      existing &&
      existing.status === "ACTIVE" &&
      existing.counselorId === parsedCounselorId;

    if (!alreadyAssignedToSameCounselor && currentLoad >= capacity) {
      return res.status(400).json({
        status: "error",
        message: "Counselor is at full capacity",
      });
    }

    const assignment = existing
      ? await prisma.counselorStudentAssignment.update({
          where: { studentId: parsedStudentId },
          data: {
            counselorId: parsedCounselorId,
            assignedBy: req.user?.id || null,
            notes: notes ? String(notes) : null,
            status: "ACTIVE",
            assignedAt: new Date(),
          },
        })
      : await prisma.counselorStudentAssignment.create({
          data: {
            counselorId: parsedCounselorId,
            studentId: parsedStudentId,
            assignedBy: req.user?.id || null,
            notes: notes ? String(notes) : null,
            status: "ACTIVE",
          },
        });

    await prisma.counselorNotification.updateMany({
      where: {
        counselorId: req.user?.id || null,
        studentId: parsedStudentId,
        title: {
          startsWith: "[CONNECT_REQUEST]",
        },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return res.status(existing ? 200 : 201).json({
      assignment,
      student: {
        id: student.id,
        name: student.fullName,
      },
      counselor: {
        id: counselor.id,
        name: counselor.fullName,
      },
    });
  } catch (error) {
    console.error("ADMIN_CREATE_ASSIGNMENT_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to assign student",
    });
  }
};

exports.updateAssignment = async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (Number.isNaN(assignmentId) || assignmentId < 1) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid assignment id" });
    }

    const { counselorId, notes, status } = req.body || {};

    const assignment = await prisma.counselorStudentAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      return res
        .status(404)
        .json({ status: "error", message: "Assignment not found" });
    }

    const data = {};

    if (counselorId !== undefined) {
      const parsedCounselorId = Number(counselorId);
      if (Number.isNaN(parsedCounselorId) || parsedCounselorId < 1) {
        return res
          .status(400)
          .json({ status: "error", message: "Invalid counselorId" });
      }

      const counselor = await prisma.user.findFirst({
        where: {
          id: parsedCounselorId,
          role: { equals: "counselor", mode: "insensitive" },
        },
      });

      if (!counselor) {
        return res
          .status(404)
          .json({ status: "error", message: "Counselor not found" });
      }

      data.counselorId = parsedCounselorId;
    }

    if (notes !== undefined) data.notes = notes ? String(notes) : null;
    if (status !== undefined) data.status = String(status);

    const updated = await prisma.counselorStudentAssignment.update({
      where: { id: assignmentId },
      data,
    });

    return res.json({ assignment: updated });
  } catch (error) {
    console.error("ADMIN_UPDATE_ASSIGNMENT_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update assignment",
    });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    if (Number.isNaN(assignmentId) || assignmentId < 1) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid assignment id" });
    }

    await prisma.counselorStudentAssignment.delete({
      where: { id: assignmentId },
    });

    return res.json({
      status: "success",
      message: "Assignment removed",
    });
  } catch (error) {
    console.error("ADMIN_DELETE_ASSIGNMENT_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete assignment",
    });
  }
};

exports.getAdminUniversities = async (req, res) => {
  try {
    const { q, country, partnered, skip = 0, limit = 200 } = req.query;

    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
    const parsedLimit = clamp(parseInt(limit, 10) || 200, 1, 500);

    const clauses = [];

    if (q) {
      const query = `%${String(q).trim()}%`;
      clauses.push(
        Prisma.sql`(name ILIKE ${query} OR country ILIKE ${query} OR program_name ILIKE ${query})`,
      );
    }

    if (country) {
      clauses.push(Prisma.sql`country = ${String(country)}`);
    }

    if (partnered !== undefined) {
      const partneredBool = String(partnered).toLowerCase() === "true";
      clauses.push(
        Prisma.sql`COALESCE(is_partnered, false) = ${partneredBool}`,
      );
    }

    const whereSql = clauses.length
      ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`
      : Prisma.empty;

    const universities = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          id,
          name,
          country,
          city,
          world_ranking,
          website,
          description,
          min_gpa,
          min_ielts,
          tuition_fee_usd,
          application_fee_usd,
          program_name,
          program_level,
          fields_offered,
          COALESCE(is_partnered, false) AS is_partnered,
          partnered_at,
          partnership_notes,
          created_at,
          updated_at
        FROM universities
        ${whereSql}
        ORDER BY COALESCE(is_partnered, false) DESC, world_ranking ASC NULLS LAST, name ASC
        OFFSET ${parsedSkip}
        LIMIT ${parsedLimit}
      `,
    );

    return res.json({ universities });
  } catch (error) {
    console.error("ADMIN_GET_UNIVERSITIES_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch universities",
    });
  }
};

exports.createAdminUniversity = async (req, res) => {
  try {
    const {
      name,
      country,
      city = null,
      ranking = null,
      tuitionFee = null,
      applicationFee = null,
      minGpa = 0,
      minIelts = null,
      website = null,
      description = null,
      programs = [],
      programName,
      programLevel = "MASTERS",
      partnershipNotes = null,
      isPartnered = true,
    } = req.body || {};

    if (!name || !country) {
      return res.status(400).json({
        status: "error",
        message: "name and country are required",
      });
    }

    const normalizedPrograms = Array.isArray(programs)
      ? programs.map((p) => String(p).trim()).filter(Boolean)
      : String(programs || "")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);

    const resolvedProgramName =
      programName || normalizedPrograms[0] || `${String(name).trim()} Program`;

    const rows = await prisma.$queryRaw(
      Prisma.sql`
        INSERT INTO universities (
          name,
          country,
          city,
          world_ranking,
          website,
          description,
          min_gpa,
          min_ielts,
          tuition_fee_usd,
          application_fee_usd,
          program_name,
          program_level,
          fields_offered,
          scholarship_available,
          is_partnered,
          partnered_at,
          partnership_notes,
          created_by_admin_id
        )
        VALUES (
          ${String(name).trim()},
          ${String(country).trim()},
          ${city ? String(city).trim() : null},
          ${parseNumber(ranking)},
          ${website ? String(website).trim() : null},
          ${description ? String(description).trim() : null},
          ${parseNumber(minGpa, 0)},
          ${parseNumber(minIelts)},
          ${parseNumber(tuitionFee)},
          ${parseNumber(applicationFee)},
          ${String(resolvedProgramName).trim()},
          ${String(programLevel).trim()},
          ${normalizedPrograms},
          ${false},
          ${Boolean(isPartnered)},
          ${Boolean(isPartnered) ? new Date() : null},
          ${partnershipNotes ? String(partnershipNotes).trim() : null},
          ${req.user?.id || null}
        )
        RETURNING *
      `,
    );

    return res.status(201).json({ university: rows[0] });
  } catch (error) {
    console.error("ADMIN_CREATE_UNIVERSITY_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to create university",
    });
  }
};

exports.updateAdminUniversity = async (req, res) => {
  try {
    const universityId = Number(req.params.id);
    if (Number.isNaN(universityId) || universityId < 1) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid university id" });
    }

    const {
      name,
      country,
      city,
      ranking,
      tuitionFee,
      applicationFee,
      minGpa,
      minIelts,
      website,
      description,
      programs,
      programName,
      programLevel,
      partnershipNotes,
    } = req.body || {};

    const normalizedPrograms =
      programs === undefined
        ? undefined
        : Array.isArray(programs)
          ? programs.map((p) => String(p).trim()).filter(Boolean)
          : String(programs || "")
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);

    const updates = [];

    if (name !== undefined)
      updates.push(Prisma.sql`name = ${String(name).trim()}`);
    if (country !== undefined)
      updates.push(Prisma.sql`country = ${String(country).trim()}`);
    if (city !== undefined)
      updates.push(Prisma.sql`city = ${city ? String(city).trim() : null}`);
    if (ranking !== undefined)
      updates.push(Prisma.sql`world_ranking = ${parseNumber(ranking)}`);
    if (tuitionFee !== undefined)
      updates.push(Prisma.sql`tuition_fee_usd = ${parseNumber(tuitionFee)}`);
    if (applicationFee !== undefined)
      updates.push(
        Prisma.sql`application_fee_usd = ${parseNumber(applicationFee)}`,
      );
    if (minGpa !== undefined)
      updates.push(Prisma.sql`min_gpa = ${parseNumber(minGpa, 0)}`);
    if (minIelts !== undefined)
      updates.push(Prisma.sql`min_ielts = ${parseNumber(minIelts)}`);
    if (website !== undefined)
      updates.push(
        Prisma.sql`website = ${website ? String(website).trim() : null}`,
      );
    if (description !== undefined)
      updates.push(
        Prisma.sql`description = ${description ? String(description).trim() : null}`,
      );
    if (programName !== undefined)
      updates.push(
        Prisma.sql`program_name = ${programName ? String(programName).trim() : null}`,
      );
    if (programLevel !== undefined)
      updates.push(
        Prisma.sql`program_level = ${programLevel ? String(programLevel).trim() : null}`,
      );
    if (normalizedPrograms !== undefined)
      updates.push(Prisma.sql`fields_offered = ${normalizedPrograms}`);
    if (partnershipNotes !== undefined)
      updates.push(
        Prisma.sql`partnership_notes = ${partnershipNotes ? String(partnershipNotes).trim() : null}`,
      );

    updates.push(Prisma.sql`updated_at = NOW()`);

    if (!updates.length) {
      return res
        .status(400)
        .json({ status: "error", message: "No updates provided" });
    }

    const rows = await prisma.$queryRaw(
      Prisma.sql`
        UPDATE universities
        SET ${Prisma.join(updates, ", ")}
        WHERE id = ${universityId}
        RETURNING *
      `,
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ status: "error", message: "University not found" });
    }

    return res.json({ university: rows[0] });
  } catch (error) {
    console.error("ADMIN_UPDATE_UNIVERSITY_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update university",
    });
  }
};

exports.toggleUniversityPartnership = async (req, res) => {
  try {
    const universityId = Number(req.params.id);
    if (Number.isNaN(universityId) || universityId < 1) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid university id" });
    }

    const { isPartnered, partnershipNotes } = req.body || {};

    if (typeof isPartnered !== "boolean") {
      return res.status(400).json({
        status: "error",
        message: "isPartnered must be a boolean",
      });
    }

    const rows = await prisma.$queryRaw(
      Prisma.sql`
        UPDATE universities
        SET
          is_partnered = ${isPartnered},
          partnered_at = ${isPartnered ? new Date() : null},
          partnership_notes = ${partnershipNotes ? String(partnershipNotes).trim() : null},
          updated_at = NOW()
        WHERE id = ${universityId}
        RETURNING *
      `,
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ status: "error", message: "University not found" });
    }

    return res.json({ university: rows[0] });
  } catch (error) {
    console.error("ADMIN_TOGGLE_UNIVERSITY_PARTNERSHIP_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to toggle partnership",
    });
  }
};

exports.deleteAdminUniversity = async (req, res) => {
  try {
    const universityId = Number(req.params.id);
    if (Number.isNaN(universityId) || universityId < 1) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid university id" });
    }

    const rows = await prisma.$queryRaw(
      Prisma.sql`
        DELETE FROM universities
        WHERE id = ${universityId}
        RETURNING id
      `,
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ status: "error", message: "University not found" });
    }

    return res.json({ status: "success", message: "University deleted" });
  } catch (error) {
    console.error("ADMIN_DELETE_UNIVERSITY_ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete university",
    });
  }
};
