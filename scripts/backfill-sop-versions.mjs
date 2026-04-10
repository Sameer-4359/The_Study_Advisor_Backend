import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sopDocuments = await prisma.document.findMany({
    where: { type: "STATEMENT_OF_PURPOSE" },
    orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
  });

  let createdCount = 0;

  for (const doc of sopDocuments) {
    const existing = await prisma.statementOfPurpose.findFirst({
      where: {
        userId: doc.userId,
        documentId: doc.id,
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    const maxVersion = await prisma.statementOfPurpose.aggregate({
      where: { userId: doc.userId },
      _max: { version: true },
    });

    const nextVersion = (maxVersion._max.version || 0) + 1;

    await prisma.statementOfPurpose.create({
      data: {
        userId: doc.userId,
        documentId: doc.id,
        version: nextVersion,
        title: doc.fileName,
        status: "SUBMITTED",
        submittedAt: doc.createdAt,
      },
    });

    createdCount += 1;
  }

  console.log(
    `Backfill complete. Created ${createdCount} SOP version records.`,
  );
}

main()
  .catch((error) => {
    console.error("SOP backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
