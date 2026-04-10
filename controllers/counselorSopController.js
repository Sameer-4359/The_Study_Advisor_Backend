const prisma = require("../prisma/client");
const { emitStudentActivity } = require("../services/activity.service");

async function resolveCounselorId(req) {
  if (req.user?.id) {
    return req.user.id;
  }

  const firstCounselor = await prisma.user.findFirst({
    where: { role: "counselor" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return firstCounselor?.id || null;
}

function normalizeReviewStatus(input) {
  const allowed = ["UNDER_REVIEW", "REVISION_REQUESTED", "APPROVED"];
  const status = String(input || "").toUpperCase();
  return allowed.includes(status) ? status : null;
}

exports.getSopReviews = async (req, res) => {
  try {
    const {
      status = "all",
      page: pageInput = "1",
      limit: limitInput = "25",
    } = req.query;
    const page = Math.max(parseInt(pageInput, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(limitInput, 10) || 25, 1), 100);

    const where = {
      ...(status && status !== "all"
        ? { status: String(status).toUpperCase() }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.statementOfPurpose.count({ where }),
      prisma.statementOfPurpose.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          reviewer: { select: { id: true, fullName: true, email: true } },
          document: { select: { id: true, fileName: true, fileUrl: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return res.status(200).json({
      status: "success",
      reviews: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error("GET_SOP_REVIEWS_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to fetch SOP reviews" });
  }
};

exports.getSopReviewById = async (req, res) => {
  try {
    const sopId = Number(req.params.id);
    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid SOP id" });
    }

    const review = await prisma.statementOfPurpose.findUnique({
      where: { id: sopId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        reviewer: { select: { id: true, fullName: true, email: true } },
        document: {
          select: { id: true, fileName: true, fileUrl: true, createdAt: true },
        },
        comments: {
          include: {
            author: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!review) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP review not found" });
    }

    return res.status(200).json({ status: "success", review });
  } catch (err) {
    console.error("GET_SOP_REVIEW_BY_ID_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to fetch SOP review" });
  }
};

exports.updateSopReview = async (req, res) => {
  try {
    const sopId = Number(req.params.id);
    const counselorId = await resolveCounselorId(req);
    const { status, reviewNotes } = req.body;

    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid SOP id" });
    }

    const nextStatus = normalizeReviewStatus(status);
    if (!nextStatus && reviewNotes === undefined) {
      return res.status(400).json({
        status: "error",
        message: "Provide valid status or reviewNotes",
      });
    }

    const existing = await prisma.statementOfPurpose.findUnique({
      where: { id: sopId },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP review not found" });
    }

    const data = {
      ...(nextStatus
        ? {
            status: nextStatus,
            reviewedAt: new Date(),
            reviewedBy: counselorId,
          }
        : {}),
      ...(reviewNotes !== undefined
        ? { reviewNotes: String(reviewNotes || "") }
        : {}),
    };

    const updated = await prisma.statementOfPurpose.update({
      where: { id: sopId },
      data,
    });

    await emitStudentActivity({
      studentId: existing.userId,
      actorId: counselorId,
      eventType: "SOP_REVIEWED",
      description: `Counselor updated SOP review to ${updated.status}`,
      metadata: {
        sopId: updated.id,
        version: updated.version,
        status: updated.status,
      },
    });

    return res.status(200).json({
      status: "success",
      message: "SOP review updated",
      review: updated,
    });
  } catch (err) {
    console.error("UPDATE_SOP_REVIEW_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to update SOP review" });
  }
};

exports.addSopComment = async (req, res) => {
  try {
    const sopId = Number(req.params.id);
    const authorId = await resolveCounselorId(req);
    const { body } = req.body;

    if (!authorId) {
      return res
        .status(404)
        .json({ status: "error", message: "Counselor not found" });
    }

    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid SOP id" });
    }

    if (!body || !String(body).trim()) {
      return res
        .status(400)
        .json({ status: "error", message: "Comment body is required" });
    }

    const sop = await prisma.statementOfPurpose.findUnique({
      where: { id: sopId },
    });
    if (!sop) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP review not found" });
    }

    const comment = await prisma.sOPReviewComment.create({
      data: {
        sopId,
        authorId,
        body: String(body).trim(),
      },
      include: { author: { select: { id: true, fullName: true, role: true } } },
    });

    return res.status(201).json({
      status: "success",
      message: "Comment added",
      comment,
    });
  } catch (err) {
    console.error("ADD_SOP_COMMENT_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to add comment" });
  }
};
