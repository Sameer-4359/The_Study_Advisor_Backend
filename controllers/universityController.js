const recommendationService = require("../services/recommendation.service");

const getUniversities = async (req, res) => {
  try {
    const {
      skip = 0,
      limit = 100,
      country,
      program_level: programLevel,
      field,
    } = req.query;

    const parsedSkip = Number(skip);
    const parsedLimit = Number(limit);

    if (Number.isNaN(parsedSkip) || parsedSkip < 0) {
      return res
        .status(400)
        .json({ detail: "skip must be a non-negative number" });
    }

    if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      return res
        .status(400)
        .json({ detail: "limit must be a number between 1 and 500" });
    }

    const universities = await recommendationService.getUniversities({
      skip: parsedSkip,
      limit: parsedLimit,
      country: country ? String(country) : undefined,
      programLevel: programLevel ? String(programLevel) : undefined,
      field: field ? String(field) : undefined,
    });

    return res.json(universities);
  } catch (error) {
    console.error("Error fetching universities:", error);
    return res
      .status(500)
      .json({ detail: `Error fetching universities: ${error.message}` });
  }
};

const getUniversityById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ detail: "Invalid university id" });
    }

    const university = await recommendationService.getUniversityById(id);

    if (!university) {
      return res.status(404).json({ detail: "University not found" });
    }

    return res.json(university);
  } catch (error) {
    console.error("Error fetching university:", error);
    return res
      .status(500)
      .json({ detail: `Error fetching university: ${error.message}` });
  }
};

const createUniversity = async (req, res) => {
  try {
    const requiredFields = [
      "name",
      "country",
      "min_gpa",
      "min_ielts",
      "program_name",
      "program_level",
      "tuition_fee_usd",
      "fields_offered",
    ];

    const missingField = requiredFields.find(
      (field) => req.body[field] === undefined,
    );
    if (missingField) {
      return res.status(400).json({ detail: `${missingField} is required` });
    }

    const created = await recommendationService.createUniversity(req.body);
    return res.status(201).json(created);
  } catch (error) {
    console.error("Error creating university:", error);
    return res
      .status(500)
      .json({ detail: `Error creating university: ${error.message}` });
  }
};

module.exports = {
  getUniversities,
  getUniversityById,
  createUniversity,
};
