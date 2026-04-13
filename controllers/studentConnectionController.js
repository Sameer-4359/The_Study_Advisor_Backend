const prisma = require("../prisma/client");
const { emitStudentActivity } = require("../services/activity.service");
const streamService = require("../services/notificationStream.service");

const CONNECT_REQUEST_PREFIX = "[CONNECT_REQUEST]";
const MEETING_REQUEST_PREFIX = "[MEETING_REQUEST]";
const CONNECT_REQUEST_COOLDOWN_HOURS = 12;

function getCompanyContactInfo() {
  return {
    companyName: process.env.STUDENT_COMPANY_NAME || "The Study Advisor",
    supportEmail:
      process.env.STUDENT_SUPPORT_EMAIL || "support@thestudyadvisor.com",
    supportPhone: process.env.STUDENT_SUPPORT_PHONE || "+92 300 1234567",
    whatsappNumber: process.env.STUDENT_WHATSAPP_NUMBER || "+92 300 1234567",
    address:
      process.env.STUDENT_COMPANY_ADDRESS || "Main Boulevard, Lahore, Pakistan",
    officeHours:
      process.env.STUDENT_OFFICE_HOURS || "Mon - Fri, 9:00 AM - 6:00 PM",
    website:
      process.env.STUDENT_COMPANY_WEBSITE || "https://thestudyadvisor.com",
  };
}

function formatAssignee(assignment) {
  if (!assignment) return null;

  return {
    assignmentId: assignment.id,
    assignedAt: assignment.assignedAt,
    notes: assignment.notes,
    counselor: {
      id: assignment.counselor.id,
      fullName: assignment.counselor.fullName,
      email: assignment.counselor.email,
      phone: assignment.counselor.counselorProfile?.phone || null,
      skills: assignment.counselor.counselorProfile?.skills || [],
      isActive: assignment.counselor.counselorProfile?.isActive ?? true,
    },
  };
}

exports.getConnectionInfo = async (req, res) => {
  try {
    const studentId = Number(req.user?.id);
    if (Number.isNaN(studentId) || studentId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized student",
      });
    }

    const [assignment, adminUsers] = await Promise.all([
      prisma.counselorStudentAssignment.findFirst({
        where: {
          studentId,
          status: "ACTIVE",
        },
        include: {
          counselor: {
            select: {
              id: true,
              fullName: true,
              email: true,
              counselorProfile: {
                select: {
                  phone: true,
                  skills: true,
                  isActive: true,
                },
              },
            },
          },
        },
        orderBy: {
          assignedAt: "desc",
        },
      }),
      prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true },
      }),
    ]);

    const adminIds = adminUsers.map((admin) => admin.id);

    let latestRequest = null;
    if (adminIds.length > 0) {
      latestRequest = await prisma.counselorNotification.findFirst({
        where: {
          counselorId: { in: adminIds },
          studentId,
          type: "SYSTEM",
          title: { startsWith: CONNECT_REQUEST_PREFIX },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    return res.status(200).json({
      status: "success",
      company: getCompanyContactInfo(),
      hasAssignedCounselor: !!assignment,
      assignedCounselor: formatAssignee(assignment),
      hasPendingConnectionRequest: !assignment && !!latestRequest,
      lastConnectionRequestedAt: latestRequest?.createdAt || null,
    });
  } catch (err) {
    console.error("GET_STUDENT_CONNECTION_INFO_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch connection info",
    });
  }
};

exports.requestConnection = async (req, res) => {
  try {
    const studentId = Number(req.user?.id);
    if (Number.isNaN(studentId) || studentId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized student",
      });
    }

    const assignment = await prisma.counselorStudentAssignment.findFirst({
      where: {
        studentId,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (assignment) {
      return res.status(400).json({
        status: "error",
        message: "A counselor is already assigned to your account.",
      });
    }

    const [student, admins] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { fullName: true, email: true },
      }),
      prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true },
      }),
    ]);

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student not found",
      });
    }

    if (admins.length === 0) {
      return res.status(500).json({
        status: "error",
        message: "No admin is available to receive connection requests",
      });
    }

    const adminIds = admins.map((admin) => admin.id);

    const recentRequest = await prisma.counselorNotification.findFirst({
      where: {
        counselorId: { in: adminIds },
        studentId,
        type: "SYSTEM",
        title: { startsWith: CONNECT_REQUEST_PREFIX },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (recentRequest) {
      const diffMs = Date.now() - new Date(recentRequest.createdAt).getTime();
      const cooldownMs = CONNECT_REQUEST_COOLDOWN_HOURS * 60 * 60 * 1000;

      if (diffMs < cooldownMs) {
        return res.status(409).json({
          status: "error",
          message:
            "Your previous request is still pending. Please wait before sending another request.",
          lastConnectionRequestedAt: recentRequest.createdAt,
        });
      }
    }

    const title = `${CONNECT_REQUEST_PREFIX} Counselor connection requested`;
    const message = `${student.fullName} (${student.email}) requested counselor assignment.`;

    await prisma.$transaction(
      adminIds.map((adminId) =>
        prisma.counselorNotification.create({
          data: {
            counselorId: adminId,
            studentId,
            type: "SYSTEM",
            title,
            message,
          },
        }),
      ),
    );

    await emitStudentActivity({
      studentId,
      actorId: studentId,
      eventType: "PROFILE_UPDATED",
      description: "Student requested counselor connection",
      metadata: {
        category: "CONNECTION",
      },
      notifyCounselors: false,
    });

    return res.status(201).json({
      status: "success",
      message: "Connection request sent successfully.",
      requestedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("REQUEST_STUDENT_CONNECTION_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to request connection",
    });
  }
};

exports.requestMeetingWithCounselor = async (req, res) => {
  try {
    const studentId = Number(req.user?.id);
    if (Number.isNaN(studentId) || studentId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized student",
      });
    }

    const { note = "", preferredDateTime = null } = req.body || {};

    const assignment = await prisma.counselorStudentAssignment.findFirst({
      where: {
        studentId,
        status: "ACTIVE",
      },
      include: {
        counselor: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        assignedAt: "desc",
      },
    });

    if (!assignment) {
      return res.status(400).json({
        status: "error",
        message: "No counselor is assigned yet.",
      });
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { fullName: true, email: true },
    });

    const meetingInfo = preferredDateTime
      ? ` Preferred time: ${preferredDateTime}.`
      : "";
    const noteInfo = String(note || "").trim()
      ? ` Note: ${String(note).trim()}`
      : "";

    const notification = await prisma.counselorNotification.create({
      data: {
        counselorId: assignment.counselorId,
        studentId,
        type: "SYSTEM",
        title: `${MEETING_REQUEST_PREFIX} Student requested meeting`,
        message: `${student?.fullName || "Student"} (${student?.email || ""}) requested to connect with counselor.${meetingInfo}${noteInfo}`,
      },
    });

    streamService.broadcastNotification(notification);

    await emitStudentActivity({
      studentId,
      actorId: studentId,
      eventType: "PROFILE_UPDATED",
      description: "Student requested a meeting with assigned counselor",
      metadata: {
        category: "MEETING",
        counselorId: assignment.counselorId,
        preferredDateTime,
      },
      notifyCounselors: false,
    });

    return res.status(201).json({
      status: "success",
      message: "Meeting request sent to your counselor.",
      counselor: {
        id: assignment.counselor.id,
        fullName: assignment.counselor.fullName,
        email: assignment.counselor.email,
      },
    });
  } catch (err) {
    console.error("REQUEST_MEETING_WITH_COUNSELOR_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to send meeting request",
    });
  }
};
