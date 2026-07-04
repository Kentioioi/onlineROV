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
 * Growth is unlimited by default: the page scrolls as the box grows, which
 * works reliably on touch devices. Scrolling *inside* the textarea is not
 * touch-friendly - iOS in particular hides the scrollbar and a drag on the
 * box scrolls the page underneath instead of the textarea's own content, so
 * users could get stuck unable to reach earlier text. While focused, the
 * box also keeps itself scrolled into view as it grows, keeping the caret
 * visible above the on-screen keyboard. `maxHeight` remains available as an
 * opt-in cap for callers that want internal scrolling instead.
 */
export function AutoGrowTextarea({
  className,
  value,
  maxHeight,
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
    if (typeof maxHeight === "number") {
      el.style.height = `${Math.min(contentHeight, maxHeight)}px`;
      el.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    } else {
      el.style.height = `${contentHeight}px`;
      el.style.overflowY = "hidden";
    }
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
      className={cn("resize-none overscroll-contain", className)}
      {...props}
    />
  );
}
