import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "./config";

export const SESSION_COOKIE = "git_master_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

type SessionPayload = { sub: "git-master"; exp: number };

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionValue(now = Date.now()): string {
  const payload: SessionPayload = {
    sub: "git-master",
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, getConfig().secret)}`;
}

export function verifySessionValue(value?: string, now = Date.now()): boolean {
  if (!value) return false;
  const [encoded, providedSignature] = value.split(".");
  if (!encoded || !providedSignature) return false;
  const expected = signature(encoded, getConfig().secret);
  const a = Buffer.from(providedSignature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    return payload.sub === "git-master" && payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function passwordsMatch(candidate: string) {
  const expected = Buffer.from(getConfig().password);
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function isAuthenticated() {
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  if (!(await isAuthenticated())) redirect("/login");
}

export function isApiAuthenticated(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return verifySessionValue(raw ? decodeURIComponent(raw) : undefined);
}
