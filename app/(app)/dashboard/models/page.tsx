import type { Metadata } from "next";
import Link from "next/link";

import { ProviderMark } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { modalityMeta, models } from "@/lib/models-data";

export const metadata: Metadata = {
  title: "Models",
  description: "Model availability and pricing for this account.",
};

const variantMap = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  utility: "utility",
} as const;

export default function DashboardModelsPage() {
  const rows = models.flatMap((model) =>
    model.variants.map((variant) => ({
      id: variant.id,
      family: model.name,
      provider: model.provider,
      modality: model.modality,
      badge: model.badge,
      detail: variant.detail ?? "—",
      price: variant.price,
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Models
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Every model reachable with this account, with the exact rate that
            applies. Availability is resolved per key scope.
          </p>
        </div>
        <Link
          href="/models"
          className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
        >
          Open full catalog
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Model ID</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Modality</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-[12px] text-foreground">
                    {row.id}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <ProviderMark
                        provider={row.provider}
                        className="size-6"
                      />
                      <span className="text-[13px] text-foreground">
                        {row.family}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        variantMap[
                          modalityMeta[row.modality].badgeVariant as keyof typeof variantMap
                        ]
                      }
                    >
                      {row.badge}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {row.detail}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {row.price}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        {rows.length} model IDs across {models.length} families. See{" "}
        <Link
          href="/pricing"
          className="text-brand underline-offset-4 hover:underline"
        >
          pricing
        </Link>{" "}
        for how each modality bills.
      </p>
    </div>
  );
}
