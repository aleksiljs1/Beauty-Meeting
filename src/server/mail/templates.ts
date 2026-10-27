import "server-only";
import type { MailMessage } from "./index";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function layout(heading: string, paragraphs: string[], action: { label: string; url: string }, footnote: string) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  return `<!doctype html><html lang="sq"><body style="margin:0;background:#faf7f4;font-family:Georgia,serif;color:#2b2724">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">
<h1 style="font-weight:normal;font-size:24px;margin:0 0 24px">${escapeHtml(heading)}</h1>${body}
<p style="margin:32px 0"><a href="${escapeHtml(action.url)}" style="background:#2b2724;color:#faf7f4;padding:12px 24px;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif;font-size:14px">${escapeHtml(action.label)}</a></p>
<p style="font-size:13px;color:#6b625b;margin:0">${escapeHtml(footnote)}</p>
</div></body></html>`;
}

export function accountSetupEmail(params: { to: string; name: string; url: string; academyName: string; validHours: number }): MailMessage {
  const heading = `Mirë se vini në ${params.academyName}`;
  const paragraphs = [
    `Përshëndetje ${params.name},`,
    "Për ju është krijuar një llogari në portalin e akademisë, ku do të gjeni mësimet, materialet dhe regjistrimet.",
    `Vendosni fjalëkalimin tuaj për të hyrë. Lidhja është e vlefshme për ${params.validHours} orë dhe mund të përdoret vetëm një herë.`,
  ];
  const footnote = "Nëse nuk e prisnit këtë email, mund ta injoroni.";
  return {
    to: params.to,
    subject: heading,
    text: `${paragraphs.join("\n\n")}\n\n${params.url}\n\n${footnote}`,
    html: layout(heading, paragraphs, { label: "Vendos fjalëkalimin", url: params.url }, footnote),
  };
}

export function lessonLiveEmail(params: { to: string; name: string; lessonTitle: string; url: string; academyName: string }): MailMessage {
  const heading = `Mësimi ka filluar: ${params.lessonTitle}`;
  const paragraphs = [
    `Përshëndetje ${params.name},`,
    `Klasa live "${params.lessonTitle}" në ${params.academyName} sapo filloi.`,
    "Hapni lidhjen më poshtë dhe hyni me llogarinë tuaj për t'u bashkuar me klasën.",
  ];
  const footnote = "Lidhja funksionon vetëm për llogarinë tuaj dhe vetëm sa keni akses në këtë mësim.";
  return {
    to: params.to,
    subject: heading,
    text: `${paragraphs.join("\n\n")}\n\n${params.url}\n\n${footnote}`,
    html: layout(heading, paragraphs, { label: "Bashkohu me klasën", url: params.url }, footnote),
  };
}

type LessonChangeEmail = { to: string; name: string; lessonTitle: string; when: string; url: string; academyName: string };
const lessonChangeFootnote = "Ky email ju dërgohet sepse jeni regjistruar në këtë mësim.";

export function lessonCancelledEmail(params: LessonChangeEmail): MailMessage {
  const heading = `Mësimi u anulua: ${params.lessonTitle}`;
  const paragraphs = [
    `Përshëndetje ${params.name},`,
    `Mësimi "${params.lessonTitle}" në ${params.academyName}, i planifikuar për ${params.when}, u anulua.`,
    "Për çdo pyetje, kontaktoni akademinë.",
  ];
  return {
    to: params.to,
    subject: heading,
    text: `${paragraphs.join("\n\n")}\n\n${params.url}\n\n${lessonChangeFootnote}`,
    html: layout(heading, paragraphs, { label: "Shiko mësimin", url: params.url }, lessonChangeFootnote),
  };
}

export function lessonRescheduledEmail(params: LessonChangeEmail): MailMessage {
  const heading = `Orari i mësimit ndryshoi: ${params.lessonTitle}`;
  const paragraphs = [
    `Përshëndetje ${params.name},`,
    `Mësimi "${params.lessonTitle}" në ${params.academyName} u zhvendos.`,
    `Orari i ri: ${params.when}.`,
  ];
  return {
    to: params.to,
    subject: heading,
    text: `${paragraphs.join("\n\n")}\n\n${params.url}\n\n${lessonChangeFootnote}`,
    html: layout(heading, paragraphs, { label: "Shiko mësimin", url: params.url }, lessonChangeFootnote),
  };
}

export function passwordResetEmail(params: { to: string; name: string; url: string }): MailMessage {
  const heading = "Rivendosni fjalëkalimin";
  const paragraphs = [
    `Përshëndetje ${params.name},`,
    "Morëm një kërkesë për të rivendosur fjalëkalimin e llogarisë suaj. Lidhja është e vlefshme për 1 orë.",
  ];
  const footnote = "Nëse nuk e keni kërkuar ju, mund ta injoroni këtë email — fjalëkalimi juaj nuk ndryshon.";
  return {
    to: params.to,
    subject: heading,
    text: `${paragraphs.join("\n\n")}\n\n${params.url}\n\n${footnote}`,
    html: layout(heading, paragraphs, { label: "Vendos fjalëkalim të ri", url: params.url }, footnote),
  };
}
