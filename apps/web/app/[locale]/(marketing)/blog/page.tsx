import Link from 'next/link';

import { createCmsClient } from '@tuckin/keystatic';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const cms = await createCmsClient();
  const { items } = await cms.getContentItems({
    collection: 'posts',
    status: 'published',
    sortBy: 'publishedAt',
    sortDirection: 'desc',
  });

  return (
    <section className={'mx-auto w-full max-w-4xl px-6 py-16'}>
      <div className={'flex flex-col gap-3'}>
        <h1 className={'text-4xl font-bold'}>Blog</h1>
        <p className={'text-muted-foreground'}>
          News, updates, and thoughts from the Tuckin team.
        </p>
      </div>

      <div className={'mt-12 flex flex-col gap-6'}>
        {items.map((post) => (
          <Link key={post.id} href={`/${locale}/blog/${post.slug}`}>
            <Card>
              <CardHeader>
                <CardTitle>{post.title}</CardTitle>
                {post.description ? (
                  <CardDescription>{post.description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className={'text-muted-foreground text-sm'}>
                {new Date(post.publishedAt).toLocaleDateString()}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
