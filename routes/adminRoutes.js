const router = require("express").Router();
const adminController = require("../controllers/adminController");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

router.use(verifyToken, checkRole("admin"));

router.get("/dashboard/summary", adminController.getDashboardSummary);
router.get(
  "/dashboard/monthly-trends",
  adminController.getDashboardMonthlyTrends,
);
router.get(
  "/dashboard/recent-activity",
  adminController.getDashboardRecentActivity,
);
router.get("/notifications", adminController.getAdminNotifications);
router.put(
  "/notifications/:id/read",
  adminController.markAdminNotificationRead,
);

router.get("/counselors", adminController.getCounselors);
router.post("/counselors", adminController.createCounselor);
router.put("/counselors/:id", adminController.updateCounselor);
router.delete("/counselors/:id", adminController.deleteCounselor);

router.get("/students", adminController.getStudentsForAssignment);
router.get(
  "/students/:id/details",
  adminController.getStudentDetailsForAssignment,
);
router.post("/assignments", adminController.createAssignment);
router.put("/assignments/:id", adminController.updateAssignment);
router.delete("/assignments/:id", adminController.deleteAssignment);

router.get("/universities", adminController.getAdminUniversities);
router.post("/universities", adminController.createAdminUniversity);
router.put("/universities/:id", adminController.updateAdminUniversity);
router.delete("/universities/:id", adminController.deleteAdminUniversity);
router.patch(
  "/universities/:id/partnership",
  adminController.toggleUniversityPartnership,
);

module.exports = router;
