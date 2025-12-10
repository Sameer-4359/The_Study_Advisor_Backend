// routes/profileRoutes.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const auth = require('../middleware/authMiddleware');

// All routes require authentication
router.use(auth.verifyToken);

// Profile CRUD operations
router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);
router.delete('/', profileController.deleteProfile);
router.get('/completion', profileController.getProfileCompletion);

// Static data endpoints (public or authenticated)
router.get('/countries', profileController.getCountries);
router.get('/education-levels', profileController.getEducationLevels);
router.get('/programs', profileController.getProgramsByLevel);

module.exports = router;