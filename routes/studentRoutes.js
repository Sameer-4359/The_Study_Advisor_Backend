// routes/studentRoutes.js
const router = require("express").Router();
const { uploadDocuments, replaceS3withCF } = require("../middleware/uploadDocuments");
const documentController = require("../controllers/documentController");
const auth = require("../middleware/authMiddleware");

// Upload/Update document
router.post(
  "/upload",
  auth.verifyToken,
  uploadDocuments.single("file"), 
  replaceS3withCF,
  documentController.uploadDocument
);

// Get all documents
router.get(
  "/documents",
  auth.verifyToken,
  documentController.getDocuments
);

// Get single document
router.get(
  "/documents/:id",
  auth.verifyToken,
  documentController.getDocumentById
);

// Update document with new file
router.put(
  "/documents/:id",
  auth.verifyToken,
  uploadDocuments.single("file"), 
  replaceS3withCF,
  documentController.updateDocument
);

// Delete document
router.delete(
  "/documents/:id",
  auth.verifyToken,
  documentController.deleteDocument
);

module.exports = router;