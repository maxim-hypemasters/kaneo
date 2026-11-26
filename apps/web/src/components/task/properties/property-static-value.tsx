import type { ReactNode } from "react";

// A property value the viewer can't change, laid out like PropertyValue.
export function PropertyStaticValue({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-7.5 min-w-0 items-center gap-2 px-2 font-medium text-[13px] text-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
      {children}
    </div>
  );
}
