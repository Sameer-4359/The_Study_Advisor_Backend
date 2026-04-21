const { Prisma } = require("@prisma/client");
const prisma = require("../prisma/client");

const EDUCATION_LEVELS = [
  "HIGH_SCHOOL",
  "BACHELORS",
  "MASTERS",
  "PHD",
  "POST_DOCTORAL",
];

const PROGRAM_TYPES = [
  "BACHELORS",
  "MASTERS",
  "PHD",
  "POST_DOCTORAL",
  "DIPLOMA",
  "FOUNDATION",
  "PG_DIPLOMA",
  "MBA",
  "RESEARCH_MASTERS",
  "EXECUTIVE_EDUCATION",
  "RESEARCH_FELLOWSHIP",
  "EXCHANGE",
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeCountry(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parsePreferredCountries(studentProfile) {
  const legacyPreferredCountry = studentProfile.preferredCountry;
  const preferredCountryField = studentProfile.preferred_country;

  return [
    ...(Array.isArray(studentProfile.preferred_countries)
      ? studentProfile.preferred_countries
      : []),
    typeof legacyPreferredCountry === "string" ? legacyPreferredCountry : "",
    typeof preferredCountryField === "string" ? preferredCountryField : "",
  ]
    .flatMap((country) => String(country || "").split(","))
    .map((country) => normalizeCountry(country))
    .filter(Boolean);
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA.length || vecA.length !== vecB.length) {
    return 0.5;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i += 1) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0.5;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getRelatedFields(field) {
  const raw = String(field || "").trim();
  const fieldLower = raw.toLowerCase();

  const fieldGroups = {
    "computer science": [
      "Computer Science",
      "Software Engineering",
      "Information Technology",
      "Data Science",
      "Artificial Intelligence",
      "Machine Learning",
    ],
    "business administration": [
      "Business Administration",
      "Management",
      "Finance",
      "Marketing",
      "Entrepreneurship",
      "MBA",
    ],
    engineering: [
      "Engineering",
      "Mechanical Engineering",
      "Electrical Engineering",
      "Civil Engineering",
      "Chemical Engineering",
      "Aerospace Engineering",
    ],
    "data science": [
      "Data Science",
      "Computer Science",
      "Statistics",
      "Machine Learning",
      "Artificial Intelligence",
    ],
    medicine: [
      "Medicine",
      "Biomedical Sciences",
      "Public Health",
      "Pharmacy",
      "Nursing",
      "Dentistry",
    ],
    psychology: [
      "Psychology",
      "Neuroscience",
      "Cognitive Science",
      "Counseling",
      "Clinical Psychology",
    ],
  };

  for (const [key, related] of Object.entries(fieldGroups)) {
    if (key.includes(fieldLower) || fieldLower.includes(key)) {
      return related;
    }
  }

  if (!raw) {
    return [];
  }

  return [raw];
}

function normalizeStudentProfile(studentProfile) {
  return {
    gpa: clamp(toNumber(studentProfile.gpa, 0), 0, 4),
    ielts_score: toNumber(studentProfile.ielts_score),
    toefl_score: toNumber(studentProfile.toefl_score),
    gre_score: toNumber(studentProfile.gre_score),
    gmat_score: toNumber(studentProfile.gmat_score),
    experience_years: Math.max(
      0,
      Math.round(toNumber(studentProfile.experience_years, 0)),
    ),
    research_experience: Boolean(studentProfile.research_experience),
    publications_count: Math.max(
      0,
      Math.round(toNumber(studentProfile.publications_count, 0)),
    ),
    work_experience_relevant: Boolean(studentProfile.work_experience_relevant),
    leadership_experience: Boolean(studentProfile.leadership_experience),
    current_education_level: String(
      studentProfile.current_education_level || "",
    ),
    field_of_study: String(studentProfile.field_of_study || "").trim(),
    institution_name: studentProfile.institution_name
      ? String(studentProfile.institution_name)
      : null,
    desired_program: String(studentProfile.desired_program || ""),
    preferred_countries: parsePreferredCountries(studentProfile),
    budget_usd: toNumber(studentProfile.budget_usd),
    preferred_intake: studentProfile.preferred_intake
      ? String(studentProfile.preferred_intake)
      : null,
    study_mode: studentProfile.study_mode
      ? String(studentProfile.study_mode)
      : null,
  };
}

function validateStudentProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return "student_profile is required";
  }

  if (
    profile.gpa === null ||
    profile.gpa === undefined ||
    Number.isNaN(Number(profile.gpa))
  ) {
    return "gpa is required";
  }

  const gpa = Number(profile.gpa);
  if (gpa < 0 || gpa > 4) {
    return "gpa must be between 0 and 4";
  }

  if (
    !EDUCATION_LEVELS.includes(String(profile.current_education_level || ""))
  ) {
    return `current_education_level must be one of: ${EDUCATION_LEVELS.join(", ")}`;
  }

  if (!PROGRAM_TYPES.includes(String(profile.desired_program || ""))) {
    return `desired_program must be one of: ${PROGRAM_TYPES.join(", ")}`;
  }

  return null;
}

function rankingTier(ranking) {
  if (!ranking) return "Not Ranked";
  if (ranking <= 50) return "Elite";
  if (ranking <= 200) return "Top Tier";
  if (ranking <= 500) return "Competitive";
  return "Good";
}

function serializeUniversity(university) {
  return {
    id: university.id,
    name: university.name,
    country: university.country,
    world_ranking: university.world_ranking,
    acceptance_rate: university.acceptance_rate,
    website: university.website,
    description: university.description,
    min_gpa: toNumber(university.min_gpa, 0),
    min_ielts: toNumber(university.min_ielts),
    min_toefl: university.min_toefl,
    min_gre: university.min_gre,
    min_gmat: university.min_gmat,
    min_experience_years: university.min_experience_years || 0,
    program_name: university.program_name,
    program_level: university.program_level,
    program_type: university.program_type,
    program_duration_months: university.program_duration_months,
    tuition_fee_usd: toNumber(university.tuition_fee_usd, 0),
    scholarship_available: Boolean(university.scholarship_available),
    avg_scholarship_percentage: toNumber(university.avg_scholarship_percentage),
    fields_offered: Array.isArray(university.fields_offered)
      ? university.fields_offered
      : [],
    requires_portfolio: Boolean(university.requires_portfolio),
    requires_research_proposal: Boolean(university.requires_research_proposal),
    requires_interview: Boolean(university.requires_interview),
    application_deadline: university.application_deadline,
    intake_seasons: Array.isArray(university.intake_seasons)
      ? university.intake_seasons
      : [],
    graduation_rate: toNumber(university.graduation_rate),
    employment_rate_6_months: toNumber(university.employment_rate_6_months),
    avg_starting_salary_usd: toNumber(university.avg_starting_salary_usd),
    created_at: university.created_at,
    updated_at: university.updated_at,
  };
}

function buildWhereForEligible(profile) {
  const clauses = [];

  clauses.push(Prisma.sql`program_level = ${profile.desired_program}`);

  if (profile.preferred_countries.length) {
    const countryClauses = profile.preferred_countries.map(
      (country) => Prisma.sql`LOWER(country) = ${country}`,
    );

    clauses.push(Prisma.sql`(${Prisma.join(countryClauses, " OR ")})`);
  }

  if (profile.budget_usd !== null) {
    clauses.push(Prisma.sql`tuition_fee_usd <= ${profile.budget_usd}`);
  }

  clauses.push(Prisma.sql`min_gpa <= ${profile.gpa}`);

  if (profile.ielts_score !== null) {
    clauses.push(
      Prisma.sql`(min_ielts IS NULL OR min_ielts <= ${profile.ielts_score})`,
    );
  }

  clauses.push(
    Prisma.sql`COALESCE(min_experience_years, 0) <= ${profile.experience_years}`,
  );

  return clauses;
}

async function getEligibleUniversities(profile) {
  const whereClauses = buildWhereForEligible(profile);
  const query = whereClauses.length
    ? Prisma.sql`SELECT * FROM universities WHERE ${Prisma.join(whereClauses, " AND ")}`
    : Prisma.sql`SELECT * FROM universities`;

  const rows = await prisma.$queryRaw(query);

  return rows.map(serializeUniversity);
}

const MAX_RECOMMENDATION_SCORE = 125;

function matchesPreferredCountry(university, preferredCountries) {
  if (!preferredCountries.length) {
    return false;
  }

  return preferredCountries.includes(normalizeCountry(university.country));
}

function matchesFieldOfStudy(university, fieldOfStudy) {
  const normalizedField = normalizeCountry(fieldOfStudy);

  if (!normalizedField) {
    return false;
  }

  const universityFields = [
    university.program_name,
    ...university.fields_offered,
  ]
    .map((field) => normalizeCountry(field))
    .filter(Boolean);

  if (universityFields.some((field) => field === normalizedField)) {
    return true;
  }

  const relatedFields = getRelatedFields(fieldOfStudy).map(normalizeCountry);

  return universityFields.some((field) =>
    relatedFields.some(
      (relatedField) =>
        field.includes(relatedField) || relatedField.includes(field),
    ),
  );
}

function calculateRecommendationScore(university, profile) {
  const preferredCountries = profile.preferred_countries;
  const recommendationReasons = [];
  let recommendationScore = 0;

  // GPA contributes the largest academic weight.
  if (profile.gpa >= university.min_gpa) {
    recommendationScore += 30;
    recommendationReasons.push("High GPA match");

    if (profile.gpa - university.min_gpa > 0.5) {
      recommendationScore += 10;
      recommendationReasons.push("CGPA exceeds requirement");
    }
  }

  // IELTS rewards both eligibility and performance above the minimum.
  if (university.min_ielts !== null && profile.ielts_score !== null) {
    if (profile.ielts_score >= university.min_ielts) {
      recommendationScore += 20;
      recommendationReasons.push("IELTS requirement met");

      if (profile.ielts_score - university.min_ielts > 0.5) {
        recommendationScore += 5;
        recommendationReasons.push("IELTS exceeds requirement");
      }
    }
  }

  // Budget favors affordable matches and stronger value for money.
  if (
    profile.budget_usd !== null &&
    university.tuition_fee_usd <= profile.budget_usd
  ) {
    recommendationScore += 25;
    recommendationReasons.push("Within budget");

    if (
      profile.budget_usd - university.tuition_fee_usd >=
      profile.budget_usd * 0.2
    ) {
      recommendationScore += 10;
      recommendationReasons.push("Significantly cheaper than budget");
    }
  }

  if (matchesPreferredCountry(university, preferredCountries)) {
    recommendationScore += 15;
    recommendationReasons.push("Preferred country");
  }

  if (matchesFieldOfStudy(university, profile.field_of_study)) {
    recommendationScore += 10;
    recommendationReasons.push("Field of study match");
  }

  if (!recommendationReasons.length) {
    recommendationReasons.push("Meets hard constraints");
  }

  return {
    recommendationScore,
    recommendationScoreNormalized: clamp(
      recommendationScore / MAX_RECOMMENDATION_SCORE,
      0,
      1,
    ),
    matchReasons: recommendationReasons.slice(0, 3),
  };
}

async function calculateSimilarityScore(university, profile) {
  const specificHistory = await prisma.$queryRaw(
    Prisma.sql`
      SELECT gpa, ielts_score, experience_years, research_experience, publications_count,
             work_experience_relevant, leadership_experience
      FROM student_admission_history
      WHERE university_applied_id = ${university.id}
        AND application_status = 'ACCEPTED'
      LIMIT 50
    `,
  );

  let history = specificHistory;

  if (!history.length) {
    history = await prisma.$queryRaw(
      Prisma.sql`
        SELECT gpa, ielts_score, experience_years, research_experience, publications_count,
               work_experience_relevant, leadership_experience
        FROM student_admission_history
        WHERE program_applied = ${university.program_level}
          AND application_status = 'ACCEPTED'
        LIMIT 50
      `,
    );
  }

  if (!history.length) {
    return 0.5;
  }

  const studentVector = [
    profile.gpa / 4.0,
    (profile.ielts_score ?? 6.5) / 9.0,
    Math.min(1.0, profile.experience_years / 5.0),
    profile.research_experience ? 1 : 0,
    Math.min(1.0, profile.publications_count / 3.0),
    profile.work_experience_relevant ? 1 : 0,
    profile.leadership_experience ? 1 : 0,
  ];

  const similarities = history.map((record) => {
    const vector = [
      toNumber(record.gpa, 0) / 4.0,
      toNumber(record.ielts_score, 6.5) / 9.0,
      Math.min(1.0, toNumber(record.experience_years, 0) / 5.0),
      record.research_experience ? 1 : 0,
      Math.min(1.0, toNumber(record.publications_count, 0) / 3.0),
      record.work_experience_relevant ? 1 : 0,
      record.leadership_experience ? 1 : 0,
    ];

    return cosineSimilarity(studentVector, vector);
  });

  const avg =
    similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
  return Math.max(0.3, Math.min(0.95, avg));
}

async function getRecommendations(inputProfile, topK = 5) {
  const started = Date.now();
  const profile = normalizeStudentProfile(inputProfile);

  const eligible = await getEligibleUniversities(profile);

  if (!eligible.length) {
    return {
      recommendations: [],
      total_considered: 0,
      message: "No universities match your criteria",
      algorithm_version: "v4.0_score_based",
      processing_time_ms: Date.now() - started,
    };
  }

  const scored = await Promise.all(
    eligible.map(async (university) => {
      const {
        recommendationScore,
        recommendationScoreNormalized,
        matchReasons,
      } = calculateRecommendationScore(university, profile);
      const similarityScore = await calculateSimilarityScore(
        university,
        profile,
      );

      return {
        university,
        recommendationScore,
        recommendation_score: recommendationScore,
        recommendationScoreNormalized,
        recommendation_score_normalized: recommendationScoreNormalized,
        recommendationScorePercent: Math.round(
          recommendationScoreNormalized * 100,
        ),
        recommendation_score_percent: Math.round(
          recommendationScoreNormalized * 100,
        ),
        recommendationScoreLabel: recommendationScore,
        recommendation_score_label: recommendationScore,
        recommendationScoreReasons: matchReasons,
        recommendation_score_reasons: matchReasons,
        recommendationReasons: matchReasons,
        matchReasons,
        match_score: recommendationScoreNormalized,
        eligibility_score: recommendationScoreNormalized,
        similarity_score: similarityScore,
        final_score: recommendationScoreNormalized,
        reasons: matchReasons,
        ranking_tier: rankingTier(university.world_ranking),
      };
    }),
  );

  const ranked = scored.sort(
    (a, b) =>
      b.recommendationScore - a.recommendationScore ||
      b.final_score - a.final_score ||
      b.similarity_score - a.similarity_score,
  );

  const top = ranked.slice(0, topK);

  return {
    recommendations: top,
    total_considered: eligible.length,
    algorithm_version: "v4.0_score_based",
    processing_time_ms: Date.now() - started,
    matched_criteria: {
      field_of_study: top.filter((item) =>
        item.matchReasons.includes("Field of study match"),
      ).length,
      preferred_countries: top.filter((item) =>
        item.matchReasons.includes("Preferred country"),
      ).length,
      budget: top.filter((item) => item.matchReasons.includes("Within budget"))
        .length,
      gpa_requirement: top.filter((item) =>
        item.matchReasons.includes("High GPA match"),
      ).length,
      ielts_requirement: top.filter((item) =>
        item.matchReasons.includes("IELTS requirement met"),
      ).length,
    },
  };
}

async function getUniversities({
  skip = 0,
  limit = 100,
  country,
  programLevel,
  field,
}) {
  const clauses = [];

  if (country) {
    clauses.push(Prisma.sql`country = ${country}`);
  }

  if (programLevel) {
    clauses.push(Prisma.sql`program_level = ${programLevel}`);
  }

  if (field) {
    clauses.push(Prisma.sql`${field} = ANY(fields_offered)`);
  }

  const whereSql = clauses.length
    ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT *
      FROM universities
      ${whereSql}
      OFFSET ${skip}
      LIMIT ${limit}
    `,
  );

  return rows.map(serializeUniversity);
}

async function getUniversityById(id) {
  const rows = await prisma.$queryRaw(
    Prisma.sql`SELECT * FROM universities WHERE id = ${id} LIMIT 1`,
  );

  return rows.length ? serializeUniversity(rows[0]) : null;
}

async function createUniversity(payload) {
  const body = {
    name: String(payload.name),
    country: String(payload.country),
    world_ranking: toNumber(payload.world_ranking),
    acceptance_rate: toNumber(payload.acceptance_rate),
    website: payload.website ? String(payload.website) : null,
    description: payload.description ? String(payload.description) : null,
    min_gpa: toNumber(payload.min_gpa, 0),
    min_ielts: toNumber(payload.min_ielts, 0),
    min_toefl: toNumber(payload.min_toefl),
    min_gre: toNumber(payload.min_gre),
    min_gmat: toNumber(payload.min_gmat),
    min_experience_years: Math.max(
      0,
      Math.round(toNumber(payload.min_experience_years, 0)),
    ),
    program_name: String(payload.program_name),
    program_level: String(payload.program_level),
    program_type: payload.program_type ? String(payload.program_type) : null,
    program_duration_months: toNumber(payload.program_duration_months),
    tuition_fee_usd: toNumber(payload.tuition_fee_usd, 0),
    scholarship_available: Boolean(payload.scholarship_available),
    avg_scholarship_percentage: toNumber(payload.avg_scholarship_percentage),
    fields_offered: Array.isArray(payload.fields_offered)
      ? payload.fields_offered.map((field) => String(field)).filter(Boolean)
      : [],
    requires_portfolio: Boolean(payload.requires_portfolio),
    requires_research_proposal: Boolean(payload.requires_research_proposal),
    requires_interview: Boolean(payload.requires_interview),
    application_deadline: payload.application_deadline
      ? String(payload.application_deadline)
      : null,
    intake_seasons: Array.isArray(payload.intake_seasons)
      ? payload.intake_seasons.map((season) => String(season)).filter(Boolean)
      : [],
  };

  const rows = await prisma.$queryRaw(
    Prisma.sql`
      INSERT INTO universities (
        name, country, world_ranking, acceptance_rate, website, description,
        min_gpa, min_ielts, min_toefl, min_gre, min_gmat, min_experience_years,
        program_name, program_level, program_type, program_duration_months,
        tuition_fee_usd, scholarship_available, avg_scholarship_percentage,
        fields_offered, requires_portfolio, requires_research_proposal,
        requires_interview, application_deadline, intake_seasons
      )
      VALUES (
        ${body.name}, ${body.country}, ${body.world_ranking}, ${body.acceptance_rate}, ${body.website}, ${body.description},
        ${body.min_gpa}, ${body.min_ielts}, ${body.min_toefl}, ${body.min_gre}, ${body.min_gmat}, ${body.min_experience_years},
        ${body.program_name}, ${body.program_level}, ${body.program_type}, ${body.program_duration_months},
        ${body.tuition_fee_usd}, ${body.scholarship_available}, ${body.avg_scholarship_percentage},
        ${body.fields_offered}, ${body.requires_portfolio}, ${body.requires_research_proposal},
        ${body.requires_interview}, ${body.application_deadline}, ${body.intake_seasons}
      )
      RETURNING *
    `,
  );

  return serializeUniversity(rows[0]);
}

module.exports = {
  validateStudentProfile,
  normalizeStudentProfile,
  getRecommendations,
  getUniversities,
  getUniversityById,
  createUniversity,
};
