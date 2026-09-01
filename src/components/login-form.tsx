"use client";

import { useState } from "react";
import { ArrowRight, GitBranch, LockKeyhole, Mic2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Не вдалося увійти");
      setLoading(false);
      return;
    }
    router.push("/workspace");
    router.refresh();
  }

  return (
    <main className="relative grid min-h-svh overflow-hidden bg-[#101315] text-white lg:grid-cols-[1.2fr_.8fr]">
      <section className="relative flex min-h-[52svh] flex-col justify-between overflow-hidden p-7 sm:p-12 lg:min-h-svh lg:p-16">
        <div className="pointer-events-none absolute -right-[18%] top-[14%] h-[48vw] min-h-[460px] w-[48vw] min-w-[460px] rounded-full border border-white/8" />
        <div className="pointer-events-none absolute -right-[10%] top-[22%] h-[32vw] min-h-[320px] w-[32vw] min-w-[320px] rounded-full border border-[#b9ec55]/25" />
        <div className="pointer-events-none absolute right-[5%] top-[33%] h-[12vw] min-h-[140px] w-[12vw] min-w-[140px] rounded-full bg-[#b9ec55] opacity-90 blur-[1px]" />
        <div className="relative flex items-center gap-3 text-sm font-semibold tracking-[-.01em]">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          GIT MASTER
          <span className="ml-1 rounded-full border border-white/15 px-2 py-1 text-[10px] font-medium text-white/55">OPEN SOURCE</span>
        </div>
        <div className="relative max-w-[720px] py-12">
          <div className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[.18em] text-[#b9ec55]">
            <Mic2 size={15} /> Voice-first issue management
          </div>
          <h1 className="max-w-[680px] text-[clamp(3.4rem,7.5vw,8rem)] font-semibold leading-[.84] tracking-[-.075em]">
            Say it.<br />Ship it.
          </h1>
          <p className="mt-8 max-w-lg text-base leading-7 text-white/58 sm:text-lg">
            Керуйте GitHub issues і Projects так швидко, як можете сформулювати думку — голосом, текстом або разом.
          </p>
        </div>
        <div className="relative flex flex-wrap gap-x-8 gap-y-3 text-xs text-white/42">
          <span className="flex items-center gap-2"><GitBranch size={14} /> GitHub Projects v2</span>
          <span className="flex items-center gap-2"><Mic2 size={14} /> Українська + multilingual</span>
          <span className="flex items-center gap-2"><LockKeyhole size={14} /> Self-hosted</span>
        </div>
      </section>

      <section className="flex items-center justify-center bg-[#f5f6f2] p-6 text-[#101315] sm:p-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.17em] text-[#7b8177]">Private workspace</p>
            <h2 className="text-4xl font-semibold tracking-[-.045em]">З поверненням</h2>
            <p className="mt-3 text-sm leading-6 text-[#6e7479]">Введіть пароль, заданий у змінній середовища <code>APP_PASSWORD</code>.</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-[#6e7479]">Пароль</span>
              <div className="flex items-center border-b-2 border-[#cfd2cc] transition focus-within:border-[#101315]">
                <LockKeyhole size={18} className="text-[#8a9087]" />
                <input
                  autoFocus
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  className="h-14 min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-[#b0b4ad]"
                />
              </div>
            </label>
            {error && <p role="alert" className="text-sm text-[#c64242]">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="focus-ring group flex h-14 w-full items-center justify-between rounded-full bg-[#101315] px-6 text-sm font-semibold text-white transition hover:bg-[#24292c] disabled:opacity-50"
            >
              <span>{loading ? "Перевіряємо…" : "Відкрити workspace"}</span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#b9ec55] text-[#101315] transition group-hover:translate-x-1"><ArrowRight size={17} /></span>
            </button>
          </form>
          <p className="mt-8 text-center text-xs text-[#91968e]">Токени GitHub шифруються AES-256-GCM і ніколи не повертаються у браузер.</p>
        </div>
      </section>
    </main>
  );
}
