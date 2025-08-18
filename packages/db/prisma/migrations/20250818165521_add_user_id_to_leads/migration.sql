-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "score" REAL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("clerkId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_leads" ("createdAt", "id", "name", "phone", "score", "status", "updatedAt") SELECT "createdAt", "id", "name", "phone", "score", "status", "updatedAt" FROM "leads";
DROP TABLE "leads";
ALTER TABLE "new_leads" RENAME TO "leads";
CREATE UNIQUE INDEX "leads_phone_key" ON "leads"("phone");
CREATE INDEX "leads_userId_idx" ON "leads"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
