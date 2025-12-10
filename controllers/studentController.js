const prisma = require("../prisma");


//upload document controller

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

    const document = await prisma.document.create({
      data: {
        userId,
        type,
        fileUrl: req.file.location,
        fileName: req.file.originalname,
      },
    });

    return res.status(201).json({
      status: "success",
      message: "Document uploaded successfully",
      document,
    });
  } catch (err) {
    console.error("UPLOAD_DOCUMENT_ERROR:", err);
    return res.status(500).json({
      status: "error",
      message: "Failed to upload document.",
    });
  }
};
