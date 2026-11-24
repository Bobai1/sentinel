import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/sentinel/login-form";
import { styles } from "@/components/sentinel/styles";
import "../sentinel.css";

export const metadata: Metadata = {
  title: "Sentinel — Sign in",
  description: "Access the Sentinel detector console.",
};

export default function SentinelLoginPage() {
  return (
    <div className={`sentinel-shell ${styles.sentinelShell}`}>
      <div className={styles.bgGrid} />
      <div className={styles.bgGlow} />
      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-[1200px] items-center px-5 py-6 md:px-8">
          <Link href="/sentinel" className="text-sm text-white/50 transition hover:text-white">
            ← Concept
          </Link>
        </header>
        <main className="mx-auto max-w-[1200px] px-5 py-16 md:px-8">
          <p className={styles.sectionLabel}>Restricted access</p>
          <h1 className={`mb-8 mt-2 text-3xl font-semibold tracking-[-0.04em] ${styles.glowText}`}>
            Sentinel console
          </h1>
          <LoginForm />
        </main>
      </div>
    </div>
  );
}
