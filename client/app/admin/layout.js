"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, Users, Building2, CreditCard, ArrowLeft, LogOut, Settings2 } from "lucide-react";
import { getStoredUser, logout } from "@/lib/api";

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser || storedUser.role !== "Admin") {
      router.push("/dashboard");
    } else {
      setUser(storedUser);
    }
  }, [router]);

  if (!user) return null; // Wait for auth check

  const navItems = [
    { name: "Özet", path: "/admin", icon: LayoutDashboard },
    { name: "Kullanıcılar", path: "/admin/users", icon: Users },
    { name: "Bürolar", path: "/admin/firms", icon: Building2 },
    { name: "Abonelikler", path: "/admin/subscriptions", icon: CreditCard },
    { name: "Sistem Yonetimi", path: "/admin/operations", icon: Settings2 },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      {/* Admin Sidebar */}
      <aside style={{ width: 260, borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column", background: "var(--color-bg-subtle)" }}>
        
        {/* Header */}
        <div style={{ padding: "24px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
              AD
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Admin Paneli</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Legal Zeka Yönetim</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "20px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.name} href={item.path} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: "var(--radius-sm)",
                textDecoration: "none", fontSize: 14, fontWeight: 500,
                background: isActive ? "var(--color-bg-elevated)" : "transparent",
                color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                border: isActive ? "1px solid var(--color-border)" : "1px solid transparent",
                transition: "all var(--transition-fast)"
              }}>
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "20px", borderTop: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            Hoş geldin, <br />
            <strong style={{ color: "var(--color-text-primary)" }}>{user.firstName} {user.lastName}</strong>
          </div>
          
          <Link href="/dashboard" style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "var(--radius-sm)",
            textDecoration: "none", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)",
            background: "var(--color-bg)", border: "1px solid var(--color-border)"
          }}>
            <ArrowLeft size={14} />
            Kullanıcı Arayüzü
          </Link>

          <button onClick={() => { logout(); router.push("/auth"); }} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "var(--radius-sm)",
            border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#EF4444",
            textAlign: "left"
          }}>
            <LogOut size={14} />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {children}
      </main>
    </div>
  );
}
