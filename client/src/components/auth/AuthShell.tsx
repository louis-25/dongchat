import Link from "next/link";

type Props = { children: React.ReactNode; footer: { text: string; href: string; link: string } };

export function AuthShell({ children, footer }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-[calc(2rem+env(safe-area-inset-top))]">
      <h1 className="text-center text-4xl font-extrabold tracking-tight text-primary">dongchat</h1>
      <p className="mb-10 mt-2 text-center text-muted-foreground">친구들과 가볍게 대화해요</p>
      {children}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {footer.text}{" "}
        <Link href={footer.href} className="font-semibold text-primary">{footer.link}</Link>
      </p>
    </main>
  );
}
