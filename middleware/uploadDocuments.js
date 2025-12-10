const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../AWS/aws");

// const bucketName = "The_Study_Advisor_Docs";
// const cloudFrontUrl = "https://d1z3lwp95i97f9.cloudfront.net";
const bucketName = 'tapbot-website-info';
const cloudFrontUrl = "https://d1augqcjseb2ys.cloudfront.net";

const uploadDocuments = multer({
  storage: multerS3({
    s3,
    bucket: bucketName,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const sanitizedName = file.originalname
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9.\-_]/g, "");

      const fileName = `${Date.now()}_${sanitizedName}`;
      cb(null, fileName);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Allowed formats: PDF, JPG, PNG, DOC, DOCX"), false);
  },
});

// Replace S3 URL with CloudFront URL
const replaceS3withCF = (req, res, next) => {
  if (req.file) {
    req.file.location = `${cloudFrontUrl}/${req.file.key}`;
  }
  next();
};

module.exports = { uploadDocuments, replaceS3withCF };
