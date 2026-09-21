"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, token, User } from "@/lib/api";

export function SessionGuard({
  children,
}: {
  children: (user: User) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!token()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    api<{ user: User }>("/api/auth/me")
      .then(({ user }) => setUser(user))
      .catch(() => router.replace("/login"));
  }, [pathname, router]);
  if (!user)
    return (
      <div className="loading-screen">
        <span className="brand-mark">✳</span>
        <p>Opening TaskFlow…</p>
      </div>
    );
  return <>{children(user)}</>;
}
