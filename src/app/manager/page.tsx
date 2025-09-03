// Server-protected /manager page: only MANAGER role may access.
// Renders WeekAtGlance (calendar-style availability view).
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import authOptions from "../../../auth.config";
import WeekAtGlance from "./WeekAtGlance";

export default async function ManagerPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role ?? "STAFF";
  if (!session?.user || role !== "MANAGER") {
    redirect("/week");
  }

  return <WeekAtGlance />;
}