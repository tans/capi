"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

type Errors = Partial<Record<"name" | "email" | "message", string>>;

export function ContactForm({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).contact;
  const topics = t.topics;

  const [sent, setSent] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});
  const [values, setValues] = React.useState({
    name: "",
    email: "",
    company: "",
    topic: topics[0],
    message: "",
  });

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!values.name.trim()) next.name = t.validation.name;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = t.validation.email;
    }
    if (values.message.trim().length < 12) {
      next.message = t.validation.message;
    }
    return next;
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length === 0) setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-md border border-border bg-card p-8">
        <span className="flex size-9 items-center justify-center rounded-full bg-emerald-50">
          <Check className="size-4 text-emerald-600" />
        </span>
        <h2 className="mt-5 text-[17px] font-semibold tracking-tight text-foreground">
          {t.success.title}
        </h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {t.success.body}
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setSent(false);
            setValues({
              name: "",
              email: "",
              company: "",
              topic: topics[0],
              message: "",
            });
          }}
        >
          {getDictionary(locale).common.sendAnother}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-md border border-border bg-card p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t.fields.name}</Label>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={Boolean(errors.name)}
            placeholder={t.fields.namePlaceholder}
          />
          {errors.name ? (
            <p className="text-[12px] text-destructive">{errors.name}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t.fields.email}</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={Boolean(errors.email)}
            placeholder={t.fields.emailPlaceholder}
          />
          {errors.email ? (
            <p className="text-[12px] text-destructive">{errors.email}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="company">{t.fields.company}</Label>
          <Input
            id="company"
            value={values.company}
            onChange={(e) => set("company", e.target.value)}
            placeholder={t.fields.companyPlaceholder}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="topic">{t.fields.topic}</Label>
          <select
            id="topic"
            value={values.topic}
            onChange={(e) => set("topic", e.target.value)}
            className="h-9 rounded-sm border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-brand/60"
          >
            {topics.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">{t.fields.message}</Label>
        <Textarea
          id="message"
          rows={5}
          value={values.message}
          onChange={(e) => set("message", e.target.value)}
          aria-invalid={Boolean(errors.message)}
          placeholder={t.fields.messagePlaceholder}
        />
        {errors.message ? (
          <p className="text-[12px] text-destructive">{errors.message}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" variant="brand" size="lg">
          {t.fields.submit}
        </Button>
        <p className="text-[12px] text-muted-foreground">
          {t.fields.replyNote}
        </p>
      </div>
    </form>
  );
}
