"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FileSummary, OpenFileButton, RenameFileButton } from "@/components/admin/materials/material-parts";
import { useApiAction } from "@/components/admin/use-api-action";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/api/client";
import { formatDate } from "@/lib/datetime";
import { admin } from "@/i18n/admin";
import { common } from "@/i18n/common";
import type { LibraryFile } from "@/server/queries/admin";

const t = admin.materials;

/** The library's files, each with the lessons that use it. */
export function LibraryList({ files }: { files: LibraryFile[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {files.map((file) => (
        <LibraryItem key={file.id} file={file} />
      ))}
    </ul>
  );
}

function LibraryItem({ file }: { file: LibraryFile }) {
  const { run, pending } = useApiAction();
  const info = { ...file, fileId: file.id };

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <FileSummary
        file={info}
        extra={
          <p className="text-xs text-muted-foreground">
            {t.library.uploaded(formatDate(file.createdAt))} ·{" "}
            {file.lessons.length === 0
              ? t.library.usedIn(0)
              : file.lessons.map((lesson, i) => (
                  <span key={lesson.id}>
                    {i > 0 && ", "}
                    <Link href={`/admin/mesimet/${lesson.id}?tab=materialet`} className="underline-offset-2 hover:underline">
                      {lesson.title}
                    </Link>
                  </span>
                ))}
          </p>
        }
      />
      <div className="flex flex-wrap items-center gap-1 self-start sm:self-center">
        <OpenFileButton file={info} />
        <RenameFileButton file={info} />
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`${common.actions.delete}: ${file.displayName}`} disabled={pending}>
              <Trash2 aria-hidden className="text-destructive" />
            </Button>
          }
          title={t.deleteTitle}
          description={t.deleteBody(file.displayName, file.lessons.length)}
          confirmLabel={common.actions.delete}
          destructive
          onConfirm={() => run(() => apiSend("delete", `/admin/library/${file.id}`), { success: t.deleted })}
        />
      </div>
    </li>
  );
}
