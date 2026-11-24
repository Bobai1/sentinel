import type { Metadata, Viewport } from "next";
import "./sentinel.css";

export const metadata: Metadata = {
  title: "Sentinel",
  description: "Always-on on-chainmonitor and wallet tracing.",
  applicationName: "Sentinel",
};

export const viewport: Viewport = {
  themeColor: "#05080c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#05080c" }}>{children}</body>
    </html>
  );
}
