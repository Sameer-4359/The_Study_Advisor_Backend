const prisma = require("../prisma/client");
const streamService = require("../services/notificationStream.service");

async function resolveCounselorId(req) {
  if (req.user?.id) {
    return req.user.id;
  }

  const firstCounselor = await prisma.user.findFirst({
    where: { role: { equals: "counselor", mode: "insensitive" } },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return firstCounselor?.id || null;
}

exports.getCounselorNotifications = async (req, res) => {
  try {
    const counselorId = await resolveCounselorId(req);

    if (!counselorId) {
      return res.status(200).json({
        status: "success",
        notifications: [],
        unreadCount: 0,
        pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
      });
    }

    const {
      page: pageInput = "1",
      limit: limitInput = "25",
      read = "all",
      type = "all",
    } = req.query;

    const page = Math.max(parseInt(pageInput, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(limitInput, 10) || 25, 1), 100);

    const where = {
      counselorId,
      ...(read !== "all"
        ? { isRead: String(read).toLowerCase() === "true" }
        : {}),
      ...(type !== "all" ? { type: String(type).toUpperCase() } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.counselorNotification.count({ where }),
      prisma.counselorNotification.findMany({
        where,
        include: {
          student: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const unreadCount = await prisma.counselorNotification.count({
      where: { counselorId, isRead: false },
    });

    return res.status(200).json({
      status: "success",
      notifications: items,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error("GET_COUNSELOR_NOTIFICATIONS_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch notifications",
    });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const counselorId = await resolveCounselorId(req);
    const notificationId = Number(req.params.id);

    if (!counselorId) {
      return res
        .status(404)
        .json({ status: "error", message: "Counselor not found" });
    }

    if (Number.isNaN(notificationId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid notification id" });
    }

    const existing = await prisma.counselorNotification.findFirst({
      where: { id: notificationId, counselorId },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ status: "error", message: "Notification not found" });
    }

    const updated = await prisma.counselorNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return res.status(200).json({ status: "success", notification: updated });
  } catch (err) {
    console.error("MARK_NOTIFICATION_READ_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to mark notification as read",
    });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const counselorId = await resolveCounselorId(req);

    if (!counselorId) {
      return res
        .status(404)
        .json({ status: "error", message: "Counselor not found" });
    }

    const result = await prisma.counselorNotification.updateMany({
      where: { counselorId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return res.status(200).json({
      status: "success",
      message: "All notifications marked as read",
      updatedCount: result.count,
    });
  } catch (err) {
    console.error("MARK_ALL_NOTIFICATIONS_READ_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to update notifications",
    });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const counselorId = await resolveCounselorId(req);
    const notificationId = Number(req.params.id);

    if (!counselorId) {
      return res
        .status(404)
        .json({ status: "error", message: "Counselor not found" });
    }

    if (Number.isNaN(notificationId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid notification id" });
    }

    const existing = await prisma.counselorNotification.findFirst({
      where: { id: notificationId, counselorId },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ status: "error", message: "Notification not found" });
    }

    await prisma.counselorNotification.delete({
      where: { id: notificationId },
    });

    return res
      .status(200)
      .json({ status: "success", message: "Notification deleted" });
  } catch (err) {
    console.error("DELETE_NOTIFICATION_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete notification",
    });
  }
};

exports.streamNotifications = async (req, res) => {
  const counselorId = await resolveCounselorId(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const client = streamService.addClient(res, counselorId);
  streamService.sendSseEvent(res, "connected", { counselorId, ts: Date.now() });

  req.on("close", () => {
    streamService.removeClient(client);
    res.end();
  });
};
