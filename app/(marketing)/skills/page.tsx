import type { Metadata } from "next";
import { Blocks, BookOpen, Repeat, Sparkles } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import {
  ClosingCta,
  FeatureGrid,
  PageHero,
  Section,
  Steps,
} from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/section";

export const metadata: Metadata = {
  title: "Agent Skills",
  description:
    "Installable workflows that pin the model, prompt scaffold, and output path for your coding agent.",
};

const skills = [
  {
    title: "brand-imagery",
    body: "Product and marketing visuals in your house style — pinned model, aspect ratio, and prompt scaffold.",
    meta: "image · brand",
  },
  {
    title: "release-video",
    body: "Short teaser clips from a changelog, with a consistent shot list and caption tone.",
    meta: "video · release",
  },
  {
    title: "voiceover",
    body: "Narration from a script, using one voice consistently across a series.",
    meta: "audio · narration",
  },
  {
    title: "doc-diagrams",
    body: "Diagram-style images that match the documentation's palette and stroke weight.",
    meta: "image · docs",
  },
  {
    title: "social-crops",
    body: "One master asset, cropped and re-composed for each channel's aspect ratio.",
    meta: "image · social",
  },
  {
    title: "podcast-beds",
    body: "Loopable music beds at a fixed tempo and mood for a recurring show.",
    meta: "music · audio",
  },
];

export default function SkillsPage() {
  return (
    <>
      <PageHero
        eyebrow="Agent Skills"
        title="Packaged workflows for coding agents"
        description="A skill pins the model, the prompt scaffold, and the output path, so the same request produces the same kind of asset every time — across every developer on the team."
        primary={{ label: "Browse the catalog", href: "/models" }}
        secondary={{ label: "Read the docs", href: "/docs/resources/tool-integrations/claude-code" }}
        code={
          <CodeBlock
            tabs={[
              {
                label: "SHELL",
                language: "bash",
                code: `# Add a skill to a project
npx -y @capi.ai/skills add brand-imagery

# Then invoke it from the agent
/brand-imagery product hero for the spring launch`,
              },
              {
                label: "PLAN",
                language: "json",
                code: `{
  "skill": "brand-imagery",
  "model": "gpt-image-2-text-to-image",
  "size": "1536x1024",
  "output": "public/marketing/",
  "style_ref": "assets/style/brand.png"
}`,
              },
            ]}
          />
        }
      />

      <Section>
        <SectionHeading
          eyebrow="Why skills"
          title="Model choice becomes a reviewable artefact"
          description="Without a skill, every generation is an ad-hoc decision: which model, which size, which prompt. With one, those choices are committed to the repository and reviewed like any other change."
        />
        <FeatureGrid
          className="mt-9"
          columns={2}
          items={[
            {
              icon: Blocks,
              title: "Consistent output",
              body: "The scaffold, model, and aspect ratio live in the skill, so a launch asset looks like the last one.",
            },
            {
              icon: BookOpen,
              title: "Reviewable by default",
              body: "Changing a skill is a pull request. Brand and legal can see exactly what will be generated before it is.",
            },
            {
              icon: Repeat,
              title: "Cheaper in practice",
              body: "Pinned models and sizes prevent accidental calls to premium video models during routine work.",
            },
            {
              icon: Sparkles,
              title: "Composable",
              body: "Skills call the MCP server's tools, so a skill can chain generation, download, and file placement.",
            },
          ]}
        />
      </Section>

      <div className="section-rule">
        <Section>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <SectionHeading eyebrow="Install" title="Three steps to a repeatable workflow" />
              <Steps
                className="mt-8"
                items={[
                  {
                    title: "Add the skill",
                    body: "Skills install per project, so the constraints travel with the repository.",
                    code: "npx -y @capi.ai/skills add brand-imagery",
                  },
                  {
                    title: "Review the plan",
                    body: "The skill declares its model, size, and output path. Commit it and it applies to everyone.",
                    code: "git add .capi/skills/brand-imagery\n git commit -m 'Add brand imagery skill'",
                  },
                  {
                    title: "Invoke it",
                    body: "Call the skill by name in your agent; it fills the prompt scaffold and writes the file.",
                    code: "/brand-imagery product hero for the spring launch",
                  },
                ]}
              />
            </div>

            <div>
              <SectionHeading eyebrow="Catalogue" title="Skills available today" />
              <div className="mt-8 flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
                {skills.map((skill) => (
                  <div key={skill.title} className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[13px] text-foreground">
                        {skill.title}
                      </span>
                      <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                        {skill.meta}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      {skill.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>

      <ClosingCta
        title="Package your workflow once"
        description="Define the model, the style, and the destination. Then let every developer generate assets that fit."
        secondary={{ label: "Skill docs", href: "/docs/resources/tool-integrations/claude-code" }}
      />
    </>
  );
}

export const dynamic = "force-static";
