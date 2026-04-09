"use server";

import { getDb } from "@/lib/db";
import { leads } from "@mpgenesis/database";

export async function submitLead(formData: FormData) {
  const propertyId = formData.get("propertyId") as string;
  const name = formData.get("name") as string | null;
  const email = formData.get("email") as string | null;
  const phone = formData.get("phone") as string | null;
  const message = formData.get("message") as string | null;
  const source = (formData.get("source") as string) ?? "contact_form";
  const locale = (formData.get("locale") as string) ?? "es";

  if (!propertyId) {
    return { success: false, error: "Missing property ID" };
  }

  if (!email && !phone) {
    return { success: false, error: "Email or phone required" };
  }

  const db = getDb();

  await db.insert(leads).values({
    propertyId,
    source,
    name: name ?? null,
    email: email ?? null,
    phone: phone ?? null,
    message: message ?? null,
    locale,
  });

  return { success: true };
}
