const prisma = require("../prisma/client");
const streamService = require("../services/notificationStream.service");
const { emitStudentActivity } = require("../services/activity.service");

const SHORTLIST_PREFIX = "[SHORTLIST]";

exports.informCounselor = async (req, res) => {
  try {
    const studentId = Number(req.user?.id);
    if (Number.isNaN(studentId) || studentId < 1) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized student",
      });
    }

    const shortlistedUniversities = Array.isArray(req.body?.shortlistedUniversities)
      ? req.body.shortlistedUniversities
      : [];
    const normalizedUniversityIds = shortlistedUniversities
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (normalizedUniversityIds.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No shortlisted universities provided",
      });
    }

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
        message:
          "No counselor is assigned yet. Please request counselor connection first.",
      });
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { fullName: true, email: true },
    });

    const title = `${SHORTLIST_PREFIX} Student shared shortlisted universities`;
    const message = `${
      student?.fullName || "Student"
    } (${student?.email || "N/A"}) shared ${
      normalizedUniversityIds.length
    } shortlisted universities. IDs: ${normalizedUniversityIds.join(", ")}`;

    const notification = await prisma.counselorNotification.create({
      data: {
        counselorId: assignment.counselorId,
        studentId,
        type: "SYSTEM",
        title,
        message,
      },
    });

    streamService.broadcastNotification(notification);

    await emitStudentActivity({
      studentId,
      actorId: studentId,
      eventType: "PROFILE_UPDATED",
      description: "Student informed counselor about shortlisted universities",
      metadata: {
        category: "SHORTLIST",
        counselorId: assignment.counselorId,
        shortlistedUniversityIds: normalizedUniversityIds,
      },
      notifyCounselors: false,
    });

    return res.status(201).json({
      status: "success",
      message: "Your counselor has been informed successfully.",
      counselor: {
        id: assignment.counselor.id,
        fullName: assignment.counselor.fullName,
        email: assignment.counselor.email,
      },
      totalUniversities: normalizedUniversityIds.length,
    });
  } catch (err) {
    console.error("INFORM_COUNSELOR_SHORTLIST_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to inform counselor",
    });
  }
};
