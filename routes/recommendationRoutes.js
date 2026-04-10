const express = require("express");
const recommendationController = require("../controllers/recommendationController");

const router = express.Router();

router.post("/", recommendationController.getRecommendations);
router.get("/test", recommendationController.testRecommendations);

module.exports = router;
