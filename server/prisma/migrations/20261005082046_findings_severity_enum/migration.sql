-- Declared most severe first so the findings list can sort by rank.
CREATE TYPE "finding_severity" AS ENUM ('critical', 'major', 'minor', 'info');

-- Cast in place rather than drop and re-add, which would lose every row.
ALTER TABLE "findings" ALTER COLUMN "severity" TYPE "finding_severity" USING "severity"::"finding_severity";
