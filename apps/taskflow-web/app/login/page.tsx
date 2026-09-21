import { AuthForm } from "@/components/AuthForm";
import { Suspense } from "react";
export default function Login() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
