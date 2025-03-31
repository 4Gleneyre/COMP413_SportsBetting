import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import UsernameCheck from "@/components/UsernameCheck";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sports Betting App",
  description: "A modern sports betting platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-900`}>
        <AuthProvider>
          <UsernameCheck />
          <Navbar />
          <main className="container mx-auto p-4">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
