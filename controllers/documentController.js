// controllers/documentController.js
const prisma = require("../prisma/client");
const { emitStudentActivity } = require("../services/activity.service");

// Upload document controller
exports.uploadDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type } = req.body;

    if (!type) {
      return res.status(400).json({
        status: "error",
        message: "Document type is required.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Document file is required.",
      });
    }

    // Check if document type already exists for this user
    const existingDoc = await prisma.document.findFirst({
      where: {
        userId,
        type,
      },
    });

    let document;

    if (existingDoc) {
      // Update existing document
      document = await prisma.document.update({
        where: { id: existingDoc.id },
        data: {
          fileUrl: req.file.location,
          fileName: req.file.originalname,
        },
      });
    } else {
      // Create new document
      document = await prisma.document.create({
        data: {
          userId,
          type,
          fileUrl: req.file.location,
          fileName: req.file.originalname,
        },
      });
    }

    await emitStudentActivity({
      studentId: userId,
      actorId: userId,
      eventType: existingDoc ? "DOCUMENT_UPDATED" : "DOCUMENT_UPLOADED",
      description: existingDoc
        ? `Student replaced ${type} document`
        : `Student uploaded ${type} document`,
      metadata: {
        documentId: document.id,
        type: document.type,
      },
    });

    return res.status(201).json({
      status: "success",
      message: existingDoc
        ? "Document updated successfully"
        : "Document uploaded successfully",
      document,
    });
  } catch (err) {
    console.error("UPLOAD_DOCUMENT_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to upload/update document.",
    });
  }
};

// Get all documents for authenticated user
exports.getDocuments = async (req, res) => {
  try {
    const userId = req.user.id;

    const documents = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Group documents by type for better frontend handling
    const groupedDocuments = documents.reduce((acc, doc) => {
      if (!acc[doc.type]) {
        acc[doc.type] = [];
      }
      acc[doc.type].push(doc);
      return acc;
    }, {});

    return res.status(200).json({
      status: "success",
      message: "Documents retrieved successfully",
      total: documents.length,
      documents,
      groupedDocuments,
    });
  } catch (err) {
    console.error("GET_DOCUMENTS_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve documents.",
    });
  }
};

// Get single document by ID
exports.getDocumentById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        userId,
      },
    });

    if (!document) {
      return res.status(404).json({
        status: "error",
        message: "Document not found.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Document retrieved successfully",
      document,
    });
  } catch (err) {
    console.error("GET_DOCUMENT_BY_ID_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve document.",
    });
  }
};

// Update document (replace with new file)
exports.updateDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Document file is required for update.",
      });
    }

    // Check if document exists and belongs to user
    const existingDoc = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        userId,
      },
    });

    if (!existingDoc) {
      return res.status(404).json({
        status: "error",
        message: "Document not found.",
      });
    }

    const updatedDocument = await prisma.document.update({
      where: { id: parseInt(id) },
      data: {
        fileUrl: req.file.location,
        fileName: req.file.originalname,
      },
    });

    await emitStudentActivity({
      studentId: userId,
      actorId: userId,
      eventType: "DOCUMENT_UPDATED",
      description: `Student updated ${updatedDocument.type} document`,
      metadata: {
        documentId: updatedDocument.id,
        type: updatedDocument.type,
      },
    });

    return res.status(200).json({
      status: "success",
      message: "Document updated successfully",
      document: updatedDocument,
    });
  } catch (err) {
    console.error("UPDATE_DOCUMENT_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to update document.",
    });
  }
};

// Delete document
exports.deleteDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if document exists and belongs to user
    const existingDoc = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        userId,
      },
    });

    if (!existingDoc) {
      return res.status(404).json({
        status: "error",
        message: "Document not found.",
      });
    }

    await prisma.document.delete({
      where: { id: parseInt(id) },
    });

    await emitStudentActivity({
      studentId: userId,
      actorId: userId,
      eventType: "DOCUMENT_DELETED",
      description: `Student deleted ${existingDoc.type} document`,
      metadata: {
        documentId: existingDoc.id,
        type: existingDoc.type,
      },
    });

    return res.status(200).json({
      status: "success",
      message: "Document deleted successfully",
    });
  } catch (err) {
    console.error("DELETE_DOCUMENT_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete document.",
    });
  }
};
