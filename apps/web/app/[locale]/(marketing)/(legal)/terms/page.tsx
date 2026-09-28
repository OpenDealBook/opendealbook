export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-3xl px-6 py-16'}>
      <h1 className={'text-4xl font-bold'}>Terms of Service</h1>
      <p className={'text-muted-foreground mt-4'}>
        These terms govern your use of Open Deal Book. By accessing the service you
        agree to the terms set out here.
      </p>

      <div className={'mt-8 flex flex-col gap-6'}>
        <div className={'flex flex-col gap-2'}>
          <h2 className={'text-2xl font-semibold'}>Use of the service</h2>
          <p className={'text-muted-foreground'}>
            You are responsible for your account and for keeping your
            credentials secure.
          </p>
        </div>

        <div className={'flex flex-col gap-2'}>
          <h2 className={'text-2xl font-semibold'}>Billing</h2>
          <p className={'text-muted-foreground'}>
            Paid plans are billed on the interval you select and renew
            automatically until cancelled.
          </p>
        </div>

        <div className={'flex flex-col gap-2'}>
          <h2 className={'text-2xl font-semibold'}>Changes</h2>
          <p className={'text-muted-foreground'}>
            We may update these terms from time to time; continued use means you
            accept the updated terms.
          </p>
        </div>
      </div>
    </section>
  );
}
