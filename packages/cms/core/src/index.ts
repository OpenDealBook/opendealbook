// @odb/cms is the blog data boundary for apps/web.
// createCmsClient() returns a Cms whose getContentItems({ collection: 'posts' })
// lists posts and getContentItemBySlug({ slug, collection: 'posts' }) fetches one.
// Each post carries slug, title, description (excerpt), publishedAt, author,
// category, cover, and content (the markdoc body). renderMarkdoc(content) turns
// that body into React nodes for the page to render.

export * from './cms';
export * from './create-cms-client';
export * from './render-markdoc';
