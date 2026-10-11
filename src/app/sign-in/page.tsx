import { Suspense } from "react";
import { safeNextPath } from "@/lib/auth/next-path";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  return (
    <>
      {params.error && <p className="mt-4 text-sm text-red-700">That link has expired or was already used. Request a new one.</p>}
      <SignInForm next={safeNextPath(params.next)} />
    </>
  );
}
