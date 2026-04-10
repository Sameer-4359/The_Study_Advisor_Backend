const recommendationService = require("../services/recommendation.service");

const MAX_TOP_K = 20;

const getRecommendations = async (req, res) => {
  try {
    const { student_profile: studentProfile, top_k: topK = 5 } = req.body || {};

    if (!studentProfile) {
      return res.status(400).json({ detail: "student_profile is required" });
    }

    const validationError =
      recommendationService.validateStudentProfile(studentProfile);
    if (validationError) {
      return res.status(400).json({ detail: validationError });
    }

    const requestedTopK = Number(topK);
    if (
      Number.isNaN(requestedTopK) ||
      requestedTopK < 1 ||
      requestedTopK > MAX_TOP_K
    ) {
      return res
        .status(400)
        .json({ detail: `top_k must be between 1 and ${MAX_TOP_K}` });
    }

    const response = await recommendationService.getRecommendations(
      studentProfile,
      requestedTopK,
    );

    if (!response.recommendations.length) {
      return res
        .status(404)
        .json({ detail: "No universities match your criteria" });
    }

    return res.json({
      recommendations: response.recommendations,
      total_considered: response.total_considered,
      algorithm_version: response.algorithm_version,
      processing_time_ms: response.processing_time_ms,
    });
  } catch (error) {
    console.error("Error generating recommendations:", error);
    return res
      .status(500)
      .json({ detail: `Error generating recommendations: ${error.message}` });
  }
};

const testRecommendations = async (_req, res) => {
  try {
    const testProfile = {
      gpa: 3.5,
      ielts_score: 7.0,
      current_education_level: "BACHELORS",
      field_of_study: "Computer Science",
      desired_program: "MASTERS",
      preferred_countries: ["USA", "Canada", "UK"],
      budget_usd: 50000,
      experience_years: 2,
      research_experience: false,
      publications_count: 0,
      work_experience_relevant: true,
      leadership_experience: false,
    };

    const response = await recommendationService.getRecommendations(
      testProfile,
      5,
    );

    return res.json({
      message: "Test recommendation successful",
      recommendations_count: response.recommendations.length,
      top_recommendation: response.recommendations[0]?.university?.name,
      full_response: response,
    });
  } catch (error) {
    console.error("Recommendation test failed:", error);
    return res
      .status(500)
      .json({ detail: `Recommendation test failed: ${error.message}` });
  }
};

module.exports = {
  getRecommendations,
  testRecommendations,
};
