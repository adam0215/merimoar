# DESIGN.md

## Headings

- Headings are semi bold.

## Standard pages

- Pages in the same product area should share a clear visual rhythm while
  allowing their structure to follow the content and interaction needs.
- Standard pages generally use 24px outer content padding. Adjust it when the
  layout, viewport, or surrounding controls require different safe space.
- Use one clear page title and semantic section headings. Keep headings semi
  bold and place related actions alongside the heading when appropriate.
- Use consistent vertical spacing between the title, sections, and their
  content. Prefer spacing controlled by the surrounding layout over a stack of
  unrelated margins.
- Content may be full width, constrained, split into columns, or use specialized
  regions when that improves readability or supports the page's purpose.

## Inputs

- Labels above inputs (text, select, checkbox, etc.) are always 14px/w500 if nothing else is specified.

## Interaction states

- Gray hover, active, highlighted, and selected backgrounds always use the `muted` color token (`bg-muted` in Tailwind). Do not recreate this state with foreground opacity or one-off gray values.

## Detail views

- Detail views use 24px content padding. Additional safe space is allowed where floating controls would otherwise cover the content.
- Toolbar content inside detail views aligns to the same 24px inset. Account for a control's internal padding when setting the toolbar container padding.

## Icons

- Tabler Icons is always used as the main icon library.
- Icons with bakgrounds are always circles, not rounded squares.

## UX copy

- UX copy is simple, short and glanceable.
- Extra copy is only added when absolutely needed. If a heading does not need an extra explanation, don't add it. Let headings and labels speak for themselves, after that add extra copy if neccesary.
