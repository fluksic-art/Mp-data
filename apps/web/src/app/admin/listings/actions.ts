"use server";

import { getDb } from "@/lib/db";
import { properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updatePropertyStatus(
  propertyId: string,
  newStatus: "draft" | "archived",
) {
  const db = getDb();

  await db
    .update(properties)
    .set({ status: newStatus })
    .where(eq(properties.id, propertyId));

  revalidatePath("/admin/listings");
  revalidatePath("/admin");
}
