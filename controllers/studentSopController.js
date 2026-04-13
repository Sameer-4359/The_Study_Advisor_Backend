const prisma = require("../prisma/client");
const { emitStudentActivity } = require("../services/activity.service");

function parseSopStatus(status) {
  const allowed = [
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "REVISION_REQUESTED",
    "APPROVED",
  ];
  return allowed.includes(String(status || "").toUpperCase())
    ? String(status).toUpperCase()
    : null;
}

exports.getMySops = async (req, res) => {
  try {
    const sops = await prisma.statementOfPurpose.findMany({
      where: { userId: req.user.id },
      include: {
        document: {
          select: { id: true, fileName: true, fileUrl: true, createdAt: true },
        },
        reviewer: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: [{ version: "desc" }],
    });

    return res.status(200).json({
      status: "success",
      sops,
    });
  } catch (err) {
    console.error("GET_MY_SOPS_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to fetch SOPs" });
  }
};

exports.getMySopById = async (req, res) => {
  try {
    const sopId = Number(req.params.id);
    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid SOP id" });
    }

    const sop = await prisma.statementOfPurpose.findFirst({
      where: { id: sopId, userId: req.user.id },
      include: {
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

    if (!sop) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP not found" });
    }

    return res.status(200).json({ status: "success", sop });
  } catch (err) {
    console.error("GET_MY_SOP_BY_ID_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to fetch SOP" });
  }
};

exports.saveDraft = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sopId, title, content, documentId } = req.body;

    if (!content && !title && !documentId) {
      return res.status(400).json({
        status: "error",
        message: "At least one field is required to save draft",
      });
    }

    if (sopId) {
      const existing = await prisma.statementOfPurpose.findFirst({
        where: { id: Number(sopId), userId },
      });

      if (!existing) {
        return res
          .status(404)
          .json({ status: "error", message: "SOP not found" });
      }

      const updated = await prisma.statementOfPurpose.update({
        where: { id: existing.id },
        data: {
          title: title ?? existing.title,
          content: content ?? existing.content,
          documentId: documentId ?? existing.documentId,
          status: "DRAFT",
        },
      });

      await emitStudentActivity({
        studentId: userId,
        actorId: userId,
        eventType: "SOP_DRAFT_SAVED",
        description: "Student updated SOP draft",
        metadata: { sopId: updated.id, version: updated.version },
      });

      return res.status(200).json({
        status: "success",
        message: "SOP draft updated",
        sop: updated,
      });
    }

    const maxVersion = await prisma.statementOfPurpose.aggregate({
      where: { userId },
      _max: { version: true },
    });

    const nextVersion = (maxVersion._max.version || 0) + 1;
    const created = await prisma.statementOfPurpose.create({
      data: {
        userId,
        version: nextVersion,
        title: title || null,
        content: content || null,
        documentId: documentId || null,
        status: "DRAFT",
      },
    });

    await emitStudentActivity({
      studentId: userId,
      actorId: userId,
      eventType: "SOP_DRAFT_SAVED",
      description: "Student saved a new SOP draft",
      metadata: { sopId: created.id, version: created.version },
    });

    return res.status(201).json({
      status: "success",
      message: "SOP draft created",
      sop: created,
    });
  } catch (err) {
    console.error("SAVE_SOP_DRAFT_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to save SOP draft" });
  }
};

exports.submitSop = async (req, res) => {
  try {
    const userId = req.user.id;
    const sopId = Number(req.body.sopId);

    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "sopId is required" });
    }

    const existing = await prisma.statementOfPurpose.findFirst({
      where: { id: sopId, userId },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP not found" });
    }

    if (!existing.content && !existing.documentId) {
      return res.status(400).json({
        status: "error",
        message: "SOP must have content or linked file before submission",
      });
    }

    const submitted = await prisma.statementOfPurpose.update({
      where: { id: existing.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    await emitStudentActivity({
      studentId: userId,
      actorId: userId,
      eventType: "SOP_SUBMITTED",
      description: "Student submitted SOP for counselor review",
      metadata: { sopId: submitted.id, version: submitted.version },
    });

    return res.status(200).json({
      status: "success",
      message: "SOP submitted",
      sop: submitted,
    });
  } catch (err) {
    console.error("SUBMIT_SOP_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to submit SOP" });
  }
};

exports.linkLatestSopDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const sopId = Number(req.params.id);

    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid SOP id" });
    }

    const sop = await prisma.statementOfPurpose.findFirst({
      where: { id: sopId, userId },
    });

    if (!sop) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP not found" });
    }

    const latestDoc = await prisma.document.findFirst({
      where: {
        userId,
        type: "STATEMENT_OF_PURPOSE",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!latestDoc) {
      return res.status(404).json({
        status: "error",
        message: "No uploaded SOP file found. Upload file first.",
      });
    }

    const updated = await prisma.statementOfPurpose.update({
      where: { id: sopId },
      data: { documentId: latestDoc.id },
      include: {
        document: {
          select: { id: true, fileName: true, fileUrl: true, createdAt: true },
        },
      },
    });

    return res.status(200).json({
      status: "success",
      message: "SOP file linked successfully",
      sop: updated,
    });
  } catch (err) {
    console.error("LINK_SOP_DOCUMENT_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to link SOP document",
    });
  }
};

exports.getSopDownloadInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const sopId = Number(req.params.id);

    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid SOP id" });
    }

    const sop = await prisma.statementOfPurpose.findFirst({
      where: { id: sopId, userId },
      include: {
        document: {
          select: { id: true, fileName: true, fileUrl: true, createdAt: true },
        },
      },
    });

    if (!sop) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP not found" });
    }

    if (!sop.document) {
      return res.status(404).json({
        status: "error",
        message: "No SOP file linked to this version",
      });
    }

    return res.status(200).json({
      status: "success",
      file: sop.document,
    });
  } catch (err) {
    console.error("GET_SOP_DOWNLOAD_INFO_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to get SOP download info",
    });
  }
};

exports.updateSopStatusSelf = async (req, res) => {
  try {
    const userId = req.user.id;
    const sopId = Number(req.params.id);
    const nextStatus = parseSopStatus(req.body.status);

    if (Number.isNaN(sopId)) {
      return res
        .status(400)
        .json({ status: "error", message: "Invalid SOP id" });
    }

    if (!nextStatus) {
      return res.status(400).json({
        status: "error",
        message: "Invalid SOP status",
      });
    }

    const sop = await prisma.statementOfPurpose.findFirst({
      where: { id: sopId, userId },
    });

    if (!sop) {
      return res
        .status(404)
        .json({ status: "error", message: "SOP not found" });
    }

    const updated = await prisma.statementOfPurpose.update({
      where: { id: sop.id },
      data: { status: nextStatus },
    });

    return res.status(200).json({ status: "success", sop: updated });
  } catch (err) {
    console.error("UPDATE_SOP_STATUS_SELF_ERROR:", err);
    return res
      .status(500)
      .json({ status: "error", message: "Failed to update SOP" });
  }
};

exports.savePdfVersion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, submit } = req.body || {};

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "SOP PDF file is required",
      });
    }

    const trimmedContent = String(content || "").trim();
    if (!trimmedContent) {
      return res.status(400).json({
        status: "error",
        message: "SOP content is required",
      });
    }

    const fileName = String(req.file.originalname || "").toLowerCase();
    const mimeType = String(req.file.mimetype || "").toLowerCase();
    if (!fileName.endsWith(".pdf") && mimeType !== "application/pdf") {
      return res.status(400).json({
        status: "error",
        message: "Only PDF SOP files are allowed",
      });
    }

    const shouldSubmit = String(submit || "false").toLowerCase() === "true";

    const maxVersion = await prisma.statementOfPurpose.aggregate({
      where: { userId },
      _max: { version: true },
    });

    const nextVersion = (maxVersion._max.version || 0) + 1;
    const sopTitle = String(title || "Statement of Purpose").trim();

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          userId,
          type: "STATEMENT_OF_PURPOSE",
          fileUrl: req.file.location,
          fileName: req.file.originalname || `sop-v${nextVersion}.pdf`,
        },
      });

      const sop = await tx.statementOfPurpose.create({
        data: {
          userId,
          documentId: document.id,
          version: nextVersion,
          title: sopTitle || "Statement of Purpose",
          content: trimmedContent,
          status: shouldSubmit ? "SUBMITTED" : "DRAFT",
          submittedAt: shouldSubmit ? new Date() : null,
        },
        include: {
          document: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              createdAt: true,
            },
          },
        },
      });

      return { sop, document };
    });

    await emitStudentActivity({
      studentId: userId,
      actorId: userId,
      eventType: shouldSubmit ? "SOP_SUBMITTED" : "SOP_DRAFT_SAVED",
      description: shouldSubmit
        ? `Student submitted SOP version ${result.sop.version}`
        : `Student saved SOP version ${result.sop.version}`,
      metadata: {
        sopId: result.sop.id,
        version: result.sop.version,
        documentId: result.document.id,
        source: "AI_SOP_WRITER_PDF",
      },
    });

    return res.status(201).json({
      status: "success",
      message: shouldSubmit
        ? "SOP PDF saved and submitted"
        : "SOP PDF version saved",
      sop: result.sop,
    });
  } catch (err) {
    console.error("SAVE_SOP_PDF_VERSION_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to save SOP PDF version",
    });
  }
};
