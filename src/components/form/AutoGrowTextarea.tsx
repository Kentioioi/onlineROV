import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Textarea that grows with its content on every browser.
 *
 * The base Textarea relies on CSS `field-sizing: content`, which iOS Safari
 * (the inspectors' primary browser) doesn't support - there the box stayed
 * fixed and long comments scrolled invisibly. This measures scrollHeight in
 * JS instead, which works everywhere.
 *
 * Growth is capped (default 320px ≈ 12 lines): on a phone with the
 * on-screen keyboard open, an uncapped box quickly grows past the visible
 * area and the caret ends up "out of reach" below the keyboard. Past the
 * cap the textarea scrolls internally, where the browser natively keeps
 * the caret in view. While focused, the box also keeps itself scrolled
 * into view as it grows.
 */
export function AutoGrowTextarea({
  className,
  value,
  maxHeight = 320,
  ref: forwardedRef,
  ...props
}: React.ComponentProps<"textarea"> & { maxHeight?: number }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset first so shrinking (deleted text) is measured correctly.
    el.style.height = "auto";
    // +2 for the top/bottom border, which scrollHeight excludes.
    const contentHeight = el.scrollHeight + 2;
    el.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    el.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    // Growing pushes the box's bottom edge downward - if the user is
    // typing in it, follow along so the caret never slides out of view
    // under the keyboard. "nearest" is a no-op while fully visible.
    if (document.activeElement === el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [value, maxHeight]);

  return (
    <Textarea
      // Merged ref: callers like react-hook-form's Controller spread their
      // own ref in via {...field} - if it simply overwrote ours (spread
      // order), the measuring effect held null and the field silently
      // stopped growing everywhere CSS field-sizing isn't supported (iOS
      // Safari), which is exactly the browser this component exists for.
      ref={(el) => {
        ref.current = el;
        if (typeof forwardedRef === "function") forwardedRef(el);
        else if (forwardedRef) forwardedRef.current = el;
      }}
      value={value}
      className={cn("resize-none", className)}
      {...props}
    />
  );
}
