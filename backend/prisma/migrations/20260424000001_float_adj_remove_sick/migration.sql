-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "sickAdjustment";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "vacationAdjustment" TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "holidayAdjustment" TYPE DOUBLE PRECISION;
