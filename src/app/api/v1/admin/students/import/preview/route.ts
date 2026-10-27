import { requireApiUser } from "@/server/auth/session";
import { ApiError, ok, route } from "@/server/http";
import { MAX_IMPORT_FILE_BYTES, parseStudentWorkbook } from "@/app/api/v1/admin/students/csvparse";

export const POST = route(async (request) => {
  await requireApiUser(request, "admin");

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMPORT_FILE_BYTES + 128_000) {
    throw new ApiError("VALIDATION_FAILED", "Skedari nuk duhet të jetë më i madh se 5 MB.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Ngarkoni një skedar Excel të vlefshëm.");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError("VALIDATION_FAILED", "Zgjidhni skedarin Excel.");
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ApiError("VALIDATION_FAILED", "Skedari nuk duhet të jetë më i madh se 5 MB.");
  }
  if (!/\.xlsx$/i.test(file.name)) {
    throw new ApiError("VALIDATION_FAILED", "Përdorni një skedar .xlsx.");
  }

  try {
    const students = await parseStudentWorkbook(Buffer.from(await file.arrayBuffer()));
    return ok({ students });
  } catch (error) {
    if (error instanceof Error) throw new ApiError("VALIDATION_FAILED", error.message);
    throw error;
  }
});
