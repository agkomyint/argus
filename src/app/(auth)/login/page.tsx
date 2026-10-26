import { Logo } from "@/components/landing/logo";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — ARGUS" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <Logo className="mb-10" />
      <LoginForm />
    </main>
  );
}
