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
    preferred_countries: Array.isArray(studentProfile.preferred_countries)
      ? studentProfile.preferred_countries
          .map((country) => String(country))
          .filter(Boolean)
      : [],
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

function buildWhereForEligible(profile, flexible) {
  const clauses = [];

  clauses.push(Prisma.sql`program_level = ${profile.desired_program}`);

  if (profile.field_of_study) {
    const related = flexible
      ? getRelatedFields(profile.field_of_study)
      : [profile.field_of_study];

    if (related.length) {
      const fieldClauses = related.map(
        (field) => Prisma.sql`${field} = ANY(fields_offered)`,
      );
      clauses.push(Prisma.sql`(${Prisma.join(fieldClauses, " OR ")})`);
    }
  }

  if (flexible && profile.gpa < 3.0) {
    clauses.push(Prisma.sql`min_gpa <= ${profile.gpa + 0.3}`);
  } else {
    clauses.push(Prisma.sql`min_gpa <= ${profile.gpa}`);
  }

  if (profile.ielts_score !== null) {
    if (flexible && profile.ielts_score < 6.5) {
      clauses.push(Prisma.sql`min_ielts <= ${profile.ielts_score + 0.5}`);
    } else {
      clauses.push(Prisma.sql`min_ielts <= ${profile.ielts_score}`);
    }
  }

  clauses.push(
    Prisma.sql`COALESCE(min_experience_years, 0) <= ${profile.experience_years}`,
  );

  if (profile.budget_usd !== null) {
    if (flexible) {
      clauses.push(Prisma.sql`tuition_fee_usd <= ${profile.budget_usd * 1.2}`);
    } else {
      clauses.push(Prisma.sql`tuition_fee_usd <= ${profile.budget_usd}`);
    }
  }

  if (profile.preferred_countries.length) {
    const countryClauses = profile.preferred_countries.map(
      (country) => Prisma.sql`country = ${country}`,
    );

    if (flexible && profile.preferred_countries.length < 3) {
      clauses.push(
        Prisma.sql`((${Prisma.join(countryClauses, " OR ")}) OR world_ranking <= 100)`,
      );
    } else {
      clauses.push(Prisma.sql`(${Prisma.join(countryClauses, " OR ")})`);
    }
  }

  return clauses;
}

async function getEligibleUniversities(profile, flexible = true) {
  const whereClauses = buildWhereForEligible(profile, flexible);
  const query = whereClauses.length
    ? Prisma.sql`SELECT * FROM universities WHERE ${Prisma.join(whereClauses, " AND ")}`
    : Prisma.sql`SELECT * FROM universities`;

  const rows = await prisma.$queryRaw(query);

  return rows.map(serializeUniversity);
}

async function getPotentialUniversities(profile) {
  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT *
      FROM universities
      WHERE program_level = ${profile.desired_program}
      ORDER BY world_ranking ASC NULLS LAST, min_gpa ASC
      LIMIT 20
    `,
  );

  return rows.map(serializeUniversity);
}

function calculateEligibilityScore(university, profile) {
  let score = 0;
  let totalWeight = 0;

  if (university.min_gpa <= profile.gpa) {
    score += Math.min(1.0, profile.gpa / 4.0) * 0.3;
    totalWeight += 0.3;
  } else {
    const gpaRatio = profile.gpa / Math.max(university.min_gpa, 0.1);
    if (gpaRatio >= 0.8) {
      score += gpaRatio * 0.15;
      totalWeight += 0.15;
    }
  }

  if (profile.ielts_score !== null && university.min_ielts !== null) {
    if (profile.ielts_score >= university.min_ielts) {
      score += Math.min(1.0, profile.ielts_score / 9.0) * 0.15;
      totalWeight += 0.15;
    } else {
      const ieltsRatio =
        profile.ielts_score / Math.max(university.min_ielts, 0.1);
      if (ieltsRatio >= 0.9) {
        score += ieltsRatio * 0.1;
        totalWeight += 0.1;
      }
    }
  }

  const expRatio = Math.min(
    1.0,
    profile.experience_years /
      Math.max(university.min_experience_years || 0, 1),
  );
  score += expRatio * 0.1;
  totalWeight += 0.1;

  let fieldMatch = 0;
  if (university.fields_offered.includes(profile.field_of_study)) {
    fieldMatch = 1;
  } else {
    const related = getRelatedFields(profile.field_of_study).map((value) =>
      value.toLowerCase(),
    );
    for (const field of university.fields_offered) {
      if (
        related.some((relatedField) =>
          field.toLowerCase().includes(relatedField.toLowerCase()),
        )
      ) {
        fieldMatch = 0.7;
        break;
      }
    }
  }
  score += fieldMatch * 0.2;
  totalWeight += 0.2;

  let countryScore = 0;
  if (profile.preferred_countries.length) {
    if (profile.preferred_countries.includes(university.country)) {
      countryScore = 1;
    } else if (university.world_ranking && university.world_ranking <= 100) {
      countryScore = 0.5;
    }
  }
  score += countryScore * 0.1;
  totalWeight += 0.1;

  let budgetScore = 0;
  if (profile.budget_usd !== null) {
    if (university.tuition_fee_usd <= profile.budget_usd) {
      budgetScore = 1;
    } else if (university.tuition_fee_usd <= profile.budget_usd * 1.2) {
      budgetScore = 0.5;
    }
  }
  score += budgetScore * 0.05;
  totalWeight += 0.05;

  let additionalScore = 0;
  if (
    profile.research_experience &&
    ["MASTERS", "PHD", "RESEARCH_MASTERS"].includes(university.program_level)
  ) {
    additionalScore += 0.05;
  }

  if (profile.publications_count > 0) {
    additionalScore += Math.min(0.03, profile.publications_count * 0.01);
  }

  if (
    profile.work_experience_relevant &&
    ["MBA", "EXECUTIVE_EDUCATION", "MASTERS"].includes(university.program_level)
  ) {
    additionalScore += 0.02;
  }

  if (profile.leadership_experience) {
    additionalScore += 0.02;
  }

  score += additionalScore * 0.1;
  totalWeight += 0.1;

  if (!totalWeight) {
    return 0;
  }

  return Math.min(1.0, score / totalWeight);
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

function calculateFinalScore(eligibilityScore, similarityScore, university) {
  let eligibilityWeight = 0.7;
  let similarityWeight = 0.3;

  if (university.world_ranking) {
    if (university.world_ranking <= 50) {
      eligibilityWeight = 0.6;
      similarityWeight = 0.4;
    } else if (university.world_ranking >= 500) {
      eligibilityWeight = 0.8;
      similarityWeight = 0.2;
    }
  }

  return Math.min(
    1.0,
    eligibilityScore * eligibilityWeight + similarityScore * similarityWeight,
  );
}

function generateReasons(
  university,
  eligibilityScore,
  similarityScore,
  profile,
) {
  const reasons = [];

  if (profile.gpa >= university.min_gpa + 0.3) {
    reasons.push(`Strong GPA (${profile.gpa})`);
  } else if (profile.gpa >= university.min_gpa) {
    reasons.push("Meets GPA requirement");
  }

  if (profile.ielts_score !== null && university.min_ielts !== null) {
    if (profile.ielts_score >= university.min_ielts + 0.5) {
      reasons.push("Good English proficiency");
    } else if (profile.ielts_score >= university.min_ielts) {
      reasons.push("Meets language requirements");
    }
  }

  if (university.fields_offered.includes(profile.field_of_study)) {
    reasons.push(`Exact match for ${profile.field_of_study}`);
  } else {
    const related = getRelatedFields(profile.field_of_study);
    const hasRelated = university.fields_offered.some((field) =>
      related.some((item) => field.toLowerCase().includes(item.toLowerCase())),
    );
    if (hasRelated) {
      reasons.push("Related program available");
    }
  }

  if (
    profile.preferred_countries.length &&
    profile.preferred_countries.includes(university.country)
  ) {
    reasons.push("Located in preferred country");
  }

  if (university.world_ranking) {
    if (university.world_ranking <= 50) {
      reasons.push(`Top ${university.world_ranking} university globally`);
    } else if (university.world_ranking <= 200) {
      reasons.push("Ranked in top 200 worldwide");
    }
  }

  if (profile.budget_usd !== null) {
    if (university.tuition_fee_usd <= profile.budget_usd) {
      reasons.push("Within your budget");
    } else if (university.tuition_fee_usd <= profile.budget_usd * 1.2) {
      reasons.push("Slightly above budget but competitive");
    }
  }

  if (similarityScore > 0.75) {
    reasons.push("Matches profile of previously accepted students");
  } else if (similarityScore > 0.6) {
    reasons.push("Similar to successful applicants");
  }

  if (reasons.length < 2) {
    if (eligibilityScore > 0.7) {
      reasons.push("Strong overall match");
    } else {
      reasons.push("Good potential match");
    }
  }

  return reasons.slice(0, 3);
}

function getMatchedCriteriaCount(profile, recommendations) {
  const matched = {
    field_of_study: 0,
    preferred_countries: 0,
    budget: 0,
    gpa_requirement: 0,
    ielts_requirement: 0,
  };

  for (const recommendation of recommendations) {
    const university = recommendation.university;

    if (university.fields_offered.includes(profile.field_of_study)) {
      matched.field_of_study += 1;
    }

    if (
      profile.preferred_countries.length &&
      profile.preferred_countries.includes(university.country)
    ) {
      matched.preferred_countries += 1;
    }

    if (
      profile.budget_usd !== null &&
      university.tuition_fee_usd <= profile.budget_usd
    ) {
      matched.budget += 1;
    }

    if (profile.gpa >= university.min_gpa) {
      matched.gpa_requirement += 1;
    }

    if (
      profile.ielts_score !== null &&
      university.min_ielts !== null &&
      profile.ielts_score >= university.min_ielts
    ) {
      matched.ielts_requirement += 1;
    }
  }

  return matched;
}

async function getRecommendations(inputProfile, topK = 5) {
  const started = Date.now();
  const profile = normalizeStudentProfile(inputProfile);

  let eligible = await getEligibleUniversities(profile, true);

  if (eligible.length < topK) {
    const potential = await getPotentialUniversities(profile);
    const existing = new Set(eligible.map((uni) => uni.id));

    for (const university of potential) {
      if (!existing.has(university.id) && eligible.length < topK * 2) {
        eligible.push(university);
        existing.add(university.id);
      }
    }
  }

  if (!eligible.length) {
    return {
      recommendations: [],
      total_considered: 0,
      message: "No universities match your criteria",
      algorithm_version: "v3.0_flexible",
      processing_time_ms: Date.now() - started,
      matched_criteria: {
        field_of_study: 0,
        preferred_countries: 0,
        budget: 0,
        gpa_requirement: 0,
        ielts_requirement: 0,
      },
    };
  }

  const scored = [];

  for (const university of eligible) {
    const eligibility = calculateEligibilityScore(university, profile);
    const similarity = await calculateSimilarityScore(university, profile);
    const finalScore = calculateFinalScore(eligibility, similarity, university);

    if (finalScore >= 0.3) {
      scored.push({
        university,
        match_score: finalScore,
        eligibility_score: eligibility,
        similarity_score: similarity,
        final_score: finalScore,
        reasons: generateReasons(university, eligibility, similarity, profile),
        ranking_tier: rankingTier(university.world_ranking),
      });
    }
  }

  scored.sort((a, b) => b.final_score - a.final_score);

  const top = scored.slice(0, topK);

  if (top.length < topK && scored.length > top.length) {
    const remaining = scored.slice(
      top.length,
      Math.min(scored.length, topK * 2),
    );
    top.push(...remaining.slice(0, topK - top.length));
  }

  return {
    recommendations: top,
    total_considered: eligible.length,
    algorithm_version: "v3.0_flexible",
    processing_time_ms: Date.now() - started,
    matched_criteria: getMatchedCriteriaCount(profile, top),
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
