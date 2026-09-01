import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default async function Home() {
  redirect((await isAuthenticated()) ? "/workspace" : "/login");
}
