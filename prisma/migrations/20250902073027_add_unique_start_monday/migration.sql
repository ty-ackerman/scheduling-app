/*
  Warnings:

  - A unique constraint covering the columns `[startMonday]` on the table `Week` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Week_startMonday_key" ON "Week"("startMonday");
