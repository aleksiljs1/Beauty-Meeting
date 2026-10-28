import type { Metadata } from "next";
import Form from "next/form";
import { Search } from "lucide-react";
import { LibraryList } from "@/components/admin/materials/library-list";
import { MaterialUploader } from "@/components/admin/materials/material-uploader";
import { EmptyState, PageHeader } from "@/components/admin/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { admin } from "@/i18n/admin";
import { requirePageUser } from "@/server/auth/session";
import { listMaterialLibrary } from "@/server/queries/admin";

export const metadata: Metadata = { title: admin.materials.library.title };

const t = admin.materials;

export default async function MaterialLibraryPage({ searchParams }: PageProps<"/admin/materialet">) {
  await requirePageUser("admin");
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const files = await listMaterialLibrary({ q });

  return (
    <div className="space-y-6">
      <PageHeader title={t.library.title} intro={t.library.intro} />

      <Form action="/admin/materialet" className="flex max-w-lg items-end gap-2" role="search">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="material-search">{t.library.search}</Label>
          <Input id="material-search" name="q" type="search" defaultValue={q} />
        </div>
        <Button type="submit" variant="outline">
          <Search aria-hidden /> {admin.students.search}
        </Button>
      </Form>

      <MaterialUploader intro={t.intro}>
        {files.length === 0 ? <EmptyState>{q ? t.library.noMatch : t.library.empty}</EmptyState> : <LibraryList files={files} />}
      </MaterialUploader>
    </div>
  );
}
