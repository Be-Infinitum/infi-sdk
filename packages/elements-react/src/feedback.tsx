import { MESSAGES, type FeedbackInput } from "@beinfi/elements";
import { useId, useState, type CSSProperties } from "react";
import { buttonStyle, useAppearanceStyle } from "./appearance.js";
import { useElementLocale } from "./locale.js";
import { useSignals } from "./signals.js";

type Reaction = NonNullable<FeedbackInput["reaction"]>;
const REACTIONS: Array<[Reaction, string]> = [
  ["love", "😍"],
  ["like", "🙂"],
  ["neutral", "😐"],
  ["dislike", "🙁"],
];

export interface FeedbackElementProps {
  /** Where the button sits. Default bottom-right. */
  position?: "bottom-right" | "bottom-left";
  /** pt-BR or en; defaults to the provider's, then <html lang>, then the browser. */
  locale?: string;
  /** Override the panel's title. */
  title?: string;
  /** Open the panel from the start, with no button (an inline feedback form). */
  inline?: boolean;
  /** Draw it without sending anything (editors, previews). */
  preview?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A feedback button for your visitors: a reaction, a line of text, or both,
 * sent to your Infi dashboard (Comportamento → Feedback), sorted by theme and
 * sentiment there. Needs `<InfiSignals>` in the same provider, which knows
 * who the visitor is and where they are.
 */
export function FeedbackElement({
  position = "bottom-right",
  locale: explicit,
  title,
  inline = false,
  preview = false,
  className,
  style,
}: FeedbackElementProps) {
  const locale = useElementLocale(explicit);
  const m = MESSAGES[locale].feedback;
  const signals = useSignals();
  const themed = useAppearanceStyle();
  const id = useId();
  const [open, setOpen] = useState(inline);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const send = async () => {
    if (preview || (!reaction && !message.trim())) return;
    setState("sending");
    try {
      await signals.feedback({ reaction: reaction ?? undefined, message: message.trim() || undefined });
      setState("sent");
      setReaction(null);
      setMessage("");
    } catch {
      setState("failed");
    }
  };

  const side = position === "bottom-left" ? { left: "1rem" } : { right: "1rem" };
  const floating: CSSProperties = inline ? {} : { position: "fixed", bottom: "1rem", zIndex: 2147483000, ...side };

  if (!open)
    return (
      <button
        type="button"
        className={className}
        style={{ ...themed, ...buttonStyle, ...floating, ...style }}
        onClick={() => {
          setOpen(true);
          setState("idle");
        }}
        data-infi-preview={preview ? "" : undefined}
      >
        {m.open}
      </button>
    );

  return (
    <section
      role="dialog"
      aria-labelledby={`${id}-title`}
      className={className}
      data-infi-preview={preview ? "" : undefined}
      style={{
        ...themed,
        ...floating,
        width: inline ? "100%" : "min(22rem, calc(100vw - 2rem))",
        padding: "1rem",
        borderRadius: "var(--infi-radius, 12px)",
        border: "1px solid var(--infi-border, rgba(0,0,0,.12))",
        boxShadow: inline ? undefined : "0 8px 30px rgba(0,0,0,.12)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <strong id={`${id}-title`}>{title ?? m.title}</strong>
        {inline ? null : (
          <button
            type="button"
            aria-label={m.close}
            onClick={() => setOpen(false)}
            style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", color: "inherit" }}
          >
            ×
          </button>
        )}
      </div>
      {state === "sent" ? (
        <p role="status" style={{ margin: 0 }}>
          {m.thanks}
        </p>
      ) : (
        <>
          <div role="radiogroup" aria-label={title ?? m.title} style={{ display: "flex", gap: "0.5rem" }}>
            {REACTIONS.map(([value, emoji]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={reaction === value}
                aria-label={m.reactions[value]}
                onClick={() => setReaction(reaction === value ? null : value)}
                style={{
                  fontSize: "1.5rem",
                  lineHeight: 1,
                  padding: "0.375rem",
                  borderRadius: "var(--infi-radius, 12px)",
                  border: `2px solid ${reaction === value ? "var(--infi-accent, #0a0a0a)" : "transparent"}`,
                  background: "none",
                  cursor: "pointer",
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <textarea
            aria-label={m.placeholder}
            placeholder={m.placeholder}
            maxLength={2000}
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{
              font: "inherit",
              color: "inherit",
              background: "transparent",
              padding: "0.5rem",
              borderRadius: "var(--infi-radius, 12px)",
              border: "1px solid var(--infi-border, rgba(0,0,0,.2))",
              resize: "vertical",
            }}
          />
          {state === "failed" ? (
            <p role="alert" style={{ margin: 0 }}>
              {m.failed}
            </p>
          ) : null}
          <button
            type="button"
            disabled={state === "sending" || (!reaction && !message.trim())}
            onClick={() => void send()}
            style={{ ...buttonStyle, opacity: state === "sending" || (!reaction && !message.trim()) ? 0.6 : 1 }}
          >
            {state === "sending" ? m.sending : m.send}
          </button>
        </>
      )}
    </section>
  );
}
