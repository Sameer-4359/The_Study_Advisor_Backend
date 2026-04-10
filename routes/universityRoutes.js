const express = require("express");
const universityController = require("../controllers/universityController");

const router = express.Router();

router.post("/", universityController.createUniversity);
router.get("/", universityController.getUniversities);
router.get("/:id", universityController.getUniversityById);

module.exports = router;
