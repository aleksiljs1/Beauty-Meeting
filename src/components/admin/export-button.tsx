"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { admin } from "@/i18n/admin";
import { api } from "@/lib/api/client";

const t = admin.export;

/** Downloads students, payments and attendance as one Excel file (through the API client: it needs the Bearer token). */
export function ExportButton() {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const response = await api.get<Blob>("/admin/export", { responseType: "blob" });
      const name = /filename="([^"]+)"/.exec(String(response.headers["content-disposition"] ?? ""))?.[1] ?? "akademia-eksport.xlsx";
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={() => void download()} disabled={pending} title={t.hint}>
      <Download aria-hidden /> {pending ? t.preparing : t.button}
    </Button>
  );
}
