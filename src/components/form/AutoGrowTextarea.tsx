import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Textarea that grows with its content on every browser.
 *
 * The base Textarea relies on CSS `field-sizing: content`, which iOS Safari
 * (the inspectors' primary browser) doesn't support - there the box stayed
 * fixed and long comments scrolled invisibly. This measures scrollHeight in
 * JS instead, which works everywhere; where field-sizing IS supported the
 * explicit height simply matches what CSS would have done.
 */
export function AutoGrowTextarea({
  className,
  value,
  ...props
}: React.ComponentProps<"textarea">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset first so shrinking (deleted text) is measured correctly.
    el.style.height = "auto";
    // +2 for the top/bottom border, which scrollHeight excludes.
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
}
