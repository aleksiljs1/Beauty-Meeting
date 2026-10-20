import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Two roles only. "admin" is the academy owner/teacher; "student" has no
 * user-management permissions. Lesson access is NOT a role permission — it comes
 * from enrolments and is enforced by the central policy in src/server/access.
 */
export const ac = createAccessControl(defaultStatements);

export const roles = {
  admin: ac.newRole(adminAc.statements),
  student: ac.newRole({}),
};

export type Role = keyof typeof roles;
export const ROLE_ADMIN: Role = "admin";
export const ROLE_STUDENT: Role = "student";
