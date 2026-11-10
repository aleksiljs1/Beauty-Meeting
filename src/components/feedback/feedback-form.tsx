"use client";

import { Loader2, Star } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { feedbackText } from "@/i18n/feedback";
import { portalText } from "@/i18n/portal";
import { ApiClientError, apiSend } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Stars } from "./stars";

const t = feedbackText.form;

export type FeedbackTarget = { topic: "LESSON"; lessonId: string } | { topic: "COURSE"; courseId: string } | { topic: "APP" };
type Saved = { rating: number; comment: string | null } | null;

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">{t.ratingLabel}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded-md p-1 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <span className="sr-only">{t.star(n)}</span>
            <Star aria-hidden className={cn("size-8 transition-colors", n <= value ? "fill-rose text-rose" : "text-muted-foreground/60 hover:text-rose")} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Rate a lesson or course (shows the saved rating with "Ndrysho" once given), or send app
 * feedback (the form empties after each message).
 */
export function FeedbackForm({ target, saved: initial = null }: { target: FeedbackTarget; saved?: Saved }) {
  const [saved, setSaved] = useState<Saved>(initial);
  const commentId = useId();
  const isApp = target.topic === "APP";
  const [editing, setEditing] = useState(!initial);
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing && saved) {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{t.yourRating}</span>
          <Stars value={saved.rating} />
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {t.edit}
          </Button>
        </div>
        {saved.comment ? <p className="text-sm whitespace-pre-line text-muted-foreground">{saved.comment}</p> : null}
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) return setError(t.pickRating);
    setPending(true);
    setError(null);
    try {
      await apiSend("post", "/feedback", { ...target, rating, comment });
      toast.success(isApp ? t.appSent : t.sent);
      if (isApp) {
        setRating(0);
        setComment("");
      } else {
        setSaved({ rating, comment: comment.trim() || null });
        setEditing(false);
      }
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : portalText.states.errorBody);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <StarPicker value={rating} onChange={setRating} />
      <div className="grid gap-1.5">
        <label htmlFor={commentId} className="text-sm">
          {t.commentLabel}
        </label>
        <Textarea
          id={commentId}
          value={comment}
          maxLength={2000}
          rows={3}
          placeholder={isApp ? t.appCommentPlaceholder : t.commentPlaceholder}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? t.sending : saved ? t.save : t.send}
        </Button>
        {saved ? (
          <Button type="button" variant="ghost" size="lg" onClick={() => setEditing(false)}>
            {t.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
