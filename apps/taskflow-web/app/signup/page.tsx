import { AuthForm } from "@/components/AuthForm";
import { Suspense } from "react";
export default function Signup() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
