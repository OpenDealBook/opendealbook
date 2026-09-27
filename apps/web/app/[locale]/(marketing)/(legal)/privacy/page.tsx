export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await params;

  return (
    <section className={'mx-auto w-full max-w-3xl px-6 py-16'}>
      <h1 className={'text-4xl font-bold'}>Privacy Policy</h1>
      <p className={'text-muted-foreground mt-4'}>
        This policy explains what data Tuckin collects and how we use it.
      </p>

      <div className={'mt-8 flex flex-col gap-6'}>
        <div className={'flex flex-col gap-2'}>
          <h2 className={'text-2xl font-semibold'}>Data we collect</h2>
          <p className={'text-muted-foreground'}>
            We collect the information you provide when you create an account
            and use the service.
          </p>
        </div>

        <div className={'flex flex-col gap-2'}>
          <h2 className={'text-2xl font-semibold'}>How we use data</h2>
          <p className={'text-muted-foreground'}>
            We use your data to operate, maintain, and improve the service.
          </p>
        </div>

        <div className={'flex flex-col gap-2'}>
          <h2 className={'text-2xl font-semibold'}>Your choices</h2>
          <p className={'text-muted-foreground'}>
            You can request access to or deletion of your data by contacting us.
          </p>
        </div>
      </div>
    </section>
  );
}
