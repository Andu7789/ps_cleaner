"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { createReviewAction } from "@/lib/actions/reviews";

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (submitted) {
    return <p className="text-sm text-success">Thanks for your feedback!</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (rating === 0) {
          setError("Please choose a star rating.");
          return;
        }
        setError(null);
        startTransition(async () => {
          try {
            await createReviewAction(bookingId, rating, comment.trim() || undefined);
            setSubmitted(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't submit your review");
          }
        });
      }}
      className="space-y-3"
    >
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} star${value > 1 ? "s" : ""}`}
            aria-checked={rating === value}
            role="radio"
            onMouseEnter={() => setHoverRating(value)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(value)}
            className="p-0.5"
          >
            <Star
              className={`h-6 w-6 ${
                (hoverRating || rating) >= value ? "fill-amber-400 text-amber-400" : "text-border"
              }`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How did it go? (optional)"
        rows={3}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
