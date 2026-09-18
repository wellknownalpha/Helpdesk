import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/query-client";

export const metadata: Metadata = {
  title: "NexusDesk — ITSM & Help Desk",
  description: "Original IT service management platform: tickets, knowledge base, service catalog, SLAs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('nexusdesk-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
