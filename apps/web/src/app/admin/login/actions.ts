"use server";

import { verifyCredentials, createSession } from "@/lib/auth";

export async function login(values: {
  user: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!verifyCredentials(values.user, values.password)) {
    return { ok: false, error: "Credenciales incorrectas" };
  }
  await createSession();
  return { ok: true };
}
