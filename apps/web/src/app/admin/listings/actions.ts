"use server";

import { getDb } from "@/lib/db";
import { properties } from "@mpgenesis/database";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type ActionResult<T = void> =
  | { ok: true; message: string; data?: T }
  | { ok: false; error: string };

export async function updatePropertyStatus(
  propertyId: string,
  newStatus: "draft" | "archived",
): Promise<ActionResult> {
  try {
    const db = getDb();
    await db
      .update(properties)
      .set({ status: newStatus })
      .where(eq(properties.id, propertyId));

    revalidatePath("/admin/listings");
    revalidatePath("/admin");

    const label = newStatus === "draft" ? "Aprobado como borrador" : "Archivado";
    return { ok: true, message: label };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error desconocido",
    };
  }
}
