"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, loginHref, token, User } from "@/lib/api";

export function SessionGuard({
  children,
}: {
  children: (user: User) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const returnTo = pathname + window.location.search;
    if (!token()) {
      router.replace(loginHref(returnTo));
      return;
    }
    api<{ user: User }>("/api/auth/me")
      .then(({ user }) => setUser(user))
      .catch(() => router.replace(loginHref(returnTo)));
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
