import Link from "next/link";
import { brand } from "@/lib/brand";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 self-start font-semibold">
        <Logo /> {brand.name}
      </Link>
      {children}
    </main>
  );
}
