"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitLead } from "@/app/actions/leads";

export function LeadForm({ propertyId }: { propertyId: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    formData.set("propertyId", propertyId);
    formData.set("source", "contact_form");
    formData.set("locale", "es");

    const result = await submitLead(formData);

    if (result.success) {
      setSubmitted(true);
      setError(null);
    } else {
      setError(result.error ?? "Something went wrong");
    }
  }

  if (submitted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-6 text-center">
          <p className="text-sm font-medium text-green-800">
            Thank you! We&apos;ll be in touch shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Interested in this property?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="name" className="text-xs">
              Name
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Your name"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="email" className="text-xs">
              Email *
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor="phone" className="text-xs">
              Phone / WhatsApp
            </Label>
            <Input
              id="phone"
              name="phone"
              placeholder="+52 984 ..."
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="message" className="text-xs">
              Message
            </Label>
            <Textarea
              id="message"
              name="message"
              placeholder="I'm interested in..."
              rows={3}
              className="mt-1"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          <Button type="submit" className="w-full">
            Send Inquiry
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function WhatsAppCTA({
  propertyTitle,
  propertyUrl,
  phone = "529842021250",
}: {
  propertyTitle: string;
  propertyUrl: string;
  phone?: string;
}) {
  const message = encodeURIComponent(
    `Hi, I'm interested in: ${propertyTitle}\n${propertyUrl}`,
  );
  const href = `https://wa.me/${phone}?text=${message}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1da851]"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      WhatsApp
    </a>
  );
}
