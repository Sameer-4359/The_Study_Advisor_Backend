// routes/studentRoutes.js
const router = require("express").Router();
const { uploadDocuments, replaceS3withCF } = require("../middleware/uploadDocuments");
const documentController = require("../controllers/documentController");
const studentSopController = require("../controllers/studentSopController");
const auth = require("../middleware/authMiddleware");

router.use(auth.verifyToken, auth.checkRole("student"));

// Upload/Update document
router.post(
  "/upload",
  uploadDocuments.single("file"),
  replaceS3withCF,
  documentController.uploadDocument
);

// Get all documents
router.get("/documents", documentController.getDocuments);

// Get single document
router.get("/documents/:id", documentController.getDocumentById);

// Update document with new file
router.put(
  "/documents/:id",
  uploadDocuments.single("file"),
  replaceS3withCF,
  documentController.updateDocument
);

// Delete document
router.delete("/documents/:id", documentController.deleteDocument);

// SOP workflow for students
router.get("/sop", studentSopController.getMySops);
router.get("/sop/:id", studentSopController.getMySopById);
router.post("/sop/draft", studentSopController.saveDraft);
router.post("/sop/submit", studentSopController.submitSop);
router.post("/sop/:id/link-latest-file", studentSopController.linkLatestSopDocument);
router.get("/sop/:id/download", studentSopController.getSopDownloadInfo);
router.put("/sop/:id/status", studentSopController.updateSopStatusSelf);

module.exports = router;
