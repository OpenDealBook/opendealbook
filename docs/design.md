# Design system

How OpenDealbook looks, and why it is shaped this way.

## Source of truth

The token system lives in one file, `packages/ui/src/styles/globals.css`, as plain CSS
custom properties on `:root` and `.dark`, mapped into Tailwind's theme through a
`@theme inline` block. Every component in `@odb/ui` and every app that imports
`@odb/ui/globals.css` reads from this one set of variables; there is no second palette or
duplicated scale anywhere else in the repo. The file is mirrored from the hosted Claude
design system for Open Deal Book, so changes to the brand start there and land here token
for token.

## Brand

The primary color is a pine green, used for primary actions, the focus ring, and the lead
chart series. Brass, a warm highlight, is a sparing accent for a handful of emphasis
moments; it is never a second primary and never carries a full surface. Neutrals are a
warm-paper background in light mode and a deep ledger ink in dark mode, rather than a
flat grey, so the product reads like a working deal record rather than a generic admin
panel.

Semantic color is kept separate from brand color. `success`, `warning`, and `destructive`
exist as their own tokens so that a won deal, an at-risk figure, and the brand's pine green
never compete for the same meaning. Chart series are differentiated by lightness as well as
hue, so the data palette stays legible for readers who can't rely on hue alone.

## Type system

Three families, each with a job:

- **Newsreader** (serif) sets display and headline moments: the largest, most editorial
  text on a page.
- **IBM Plex Sans** is the interface workhorse: headings, body copy, and labels throughout
  the product.
- **IBM Plex Mono** is reserved for data: figures, currency, dates, and anything else where
  character alignment matters.

The three families are bound to `--font-serif`, `--font-sans`, and `--font-mono` in
`globals.css` and loaded in the web app through `next/font/google`, so the same variable
names resolve to the real faces at runtime and to a sane fallback stack anywhere else that
imports the stylesheet, such as Storybook.

## Spacing, radius, and elevation

Spacing follows a 4px scale, from a 4px hairline gap up to 48px for major page regions.
Radius follows a small fixed scale (4 / 6 / 8 / 12px) rather than a single multiplier, so
chips and inputs stay crisper than cards, and cards stay crisper than dialogs. Elevation is
restrained: shadows exist for resting cards, hovered cards and dropdowns, and dialogs, but
a border is preferred to a shadow wherever either would do the job.

## Logo and brand assets

The product logo and other brand assets ship from `apps/web/public` and from `@odb/ui`.
That work is being finalized separately from the token system described here.
