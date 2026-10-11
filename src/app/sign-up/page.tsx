import { cookies } from "next/headers";
import { Suspense } from "react";
import { safeNextPath } from "@/lib/auth/next-path";
import { AGE_BLOCK_COOKIE } from "@/lib/age";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create an account", robots: { index: false } };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <main className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const params = await searchParams;
  const blocked = Boolean((await cookies()).get(AGE_BLOCK_COOKIE));
  return <SignUpForm next={safeNextPath(params.next, "/account")} blocked={blocked} />;
}
