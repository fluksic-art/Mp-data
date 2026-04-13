import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "mpg_admin_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_PASSWORD env var is required");
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function verifyCredentials(user: string, password: string): boolean {
  return (
    user === (process.env.ADMIN_USER ?? "admin") &&
    password === getSecret()
  );
}

export async function createSession(): Promise<void> {
  const token = `authenticated:${Date.now()}`;
  const signature = sign(token);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${token}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return false;

  const lastDot = cookie.value.lastIndexOf(".");
  if (lastDot === -1) return false;

  const token = cookie.value.slice(0, lastDot);
  const signature = cookie.value.slice(lastDot + 1);
  const expected = sign(token);

  try {
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}
