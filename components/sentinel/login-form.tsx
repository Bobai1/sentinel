"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { styles } from "@/components/sentinel/styles";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/sentinel/live");

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("next");
    if (value?.startsWith("/sentinel/")) setNext(value);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sentinel-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("That password is not correct.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.card} mx-auto max-w-md p-7`}>
      <h2 className="text-lg font-semibold text-[#eafcff]">Sign in to Sentinel</h2>
      <p className="mt-2 text-xs leading-relaxed text-white/50">
        This console contains client watchlists and leads. Enter the access password.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Access password"
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-[#eafcff] outline-none placeholder:text-white/25 focus:border-cyan-400/50"
        />
        {error && <p className="text-xs text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className={`${styles.btn} ${styles.btnPrimary} w-full`}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
