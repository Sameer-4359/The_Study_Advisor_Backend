const prisma = require("../prisma/client");
const streamService = require("./notificationStream.service");

const EVENT_TO_NOTIFICATION_TYPE = {
  PROFILE_UPDATED: "PROFILE",
  DOCUMENT_UPLOADED: "DOCUMENT",
  DOCUMENT_UPDATED: "DOCUMENT",
  DOCUMENT_DELETED: "DOCUMENT",
  SOP_DRAFT_SAVED: "SOP",
  SOP_SUBMITTED: "SOP",
  SOP_REVIEWED: "SOP",
};

async function emitStudentActivity({
  studentId,
  actorId = null,
  eventType,
  description,
  metadata = null,
  notifyCounselors = true,
}) {
  try {
    const event = await prisma.studentActivityEvent.create({
      data: {
        studentId,
        actorId,
        eventType,
        description,
        metadata,
      },
    });

    if (!notifyCounselors) {
      return { event, notifications: [] };
    }

    const counselors = await prisma.user.findMany({
      where: { role: { equals: "counselor", mode: "insensitive" } },
      select: { id: true },
    });

    if (counselors.length === 0) {
      return { event, notifications: [] };
    }

    const type = EVENT_TO_NOTIFICATION_TYPE[eventType] || "SYSTEM";

    const createdNotifications = await Promise.all(
      counselors.map((counselor) =>
        prisma.counselorNotification.create({
          data: {
            counselorId: counselor.id,
            studentId,
            activityEventId: event.id,
            type,
            title: description,
            message: description,
          },
        }),
      ),
    );

    for (const notification of createdNotifications) {
      streamService.broadcastNotification(notification);
    }

    return { event, notifications: createdNotifications };
  } catch (error) {
    console.warn("ACTIVITY_EMIT_SKIPPED:", error?.message || error);
    return { event: null, notifications: [] };
  }
}

module.exports = {
  emitStudentActivity,
};
