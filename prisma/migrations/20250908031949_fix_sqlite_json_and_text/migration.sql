-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "emailVerified" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'COLLEGE_WEST',
    "rolesJson" JSONB
);
INSERT INTO "new_User" ("createdAt", "email", "id", "image", "location", "name", "rolesJson", "updatedAt") SELECT "createdAt", "email", "id", "image", "location", "name", "rolesJson", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
