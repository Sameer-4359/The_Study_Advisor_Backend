const router = require("express").Router();
const counselorController = require("../controllers/counselorController");
const counselorSopController = require("../controllers/counselorSopController");
const notificationController = require("../controllers/notificationController");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

router.use(verifyToken, checkRole("counselor"));

router.get("/students", counselorController.getCounselorStudents);
router.get("/students/:id", counselorController.getCounselorStudentById);
router.get(
  "/students/:id/activities",
  counselorController.getCounselorStudentActivities,
);

router.get("/sop-reviews", counselorSopController.getSopReviews);
router.get("/sop-reviews/:id", counselorSopController.getSopReviewById);
router.put("/sop-reviews/:id", counselorSopController.updateSopReview);
router.post("/sop-reviews/:id/comments", counselorSopController.addSopComment);

router.get("/notifications", notificationController.getCounselorNotifications);
router.get("/notifications/stream", notificationController.streamNotifications);
router.put(
  "/notifications/:id/read",
  notificationController.markNotificationRead,
);
router.put(
  "/notifications/read-all",
  notificationController.markAllNotificationsRead,
);
router.delete("/notifications/:id", notificationController.deleteNotification);

module.exports = router;
