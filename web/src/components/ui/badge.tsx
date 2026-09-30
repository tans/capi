import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-sm border px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-muted-foreground border-border bg-muted/40",
        brand: "border-transparent bg-brand text-brand-foreground",
        text: "border-transparent bg-[#fbe8ff] text-[#a21caf]",
        image: "border-transparent bg-[#f3e8ff] text-[#7c3aed]",
        video: "border-transparent bg-[#ffedd5] text-[#c2410c]",
        audio: "border-transparent bg-[#fef3c7] text-[#a16207]",
        utility: "border-transparent bg-[#ccfbf1] text-[#0f766e]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
