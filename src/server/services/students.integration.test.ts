import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { ageOn, emptyStudentProfile } from "@/lib/student-profile";
import { createUser, resetDatabase } from "@/test/fixtures";

const { saveStudentProfile } = await import("./students");
const { listStudents } = await import("@/server/queries/admin");
const { updateStudentSchema } = await import("@/server/validation/admin");

let admin: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await createUser("admin");
});

describe("optional student details", () => {
  it("saves, shows and clears them, and finds students by phone", async () => {
    const student = await createUser("student");
    const details = { phone: "+355 69 123 4567", birthDate: "2001-05-20", gender: "FEMALE" as const, city: "Tiranë", notes: "Preferon mbrëmjet" };
    await saveStudentProfile(student.id, details, admin);

    const [row] = (await listStudents({ q: "69 123" })).items;
    expect(row).toMatchObject({ id: student.id, profile: details });

    await saveStudentProfile(student.id, emptyStudentProfile, admin);
    expect((await listStudents({})).items[0].profile).toEqual(emptyStudentProfile);
  });

  it("refuses details that aren't a student's", async () => {
    await expect(saveStudentProfile(admin.id, emptyStudentProfile, admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates the fields and works out the age from the birth date", () => {
    const bad = updateStudentSchema.safeParse({ profile: { ...emptyStudentProfile, phone: "call me", birthDate: "1850-01-01" } });
    expect(bad.success ? [] : bad.error.issues.map((i) => i.path.join("."))).toEqual(["profile.phone", "profile.birthDate"]);
    expect(ageOn("2001-05-20", "2026-05-19")).toBe(24);
    expect(ageOn("2001-05-20", "2026-05-20")).toBe(25);
  });
});
