# Recopy

Social post templates that clients can re-copy in the browser. Pick a template, change the text (in the side panel or straight on the post), swap photos, download a PNG. No build step, no backend: plain HTML/CSS/JS served by GitHub Pages.

- Live: https://todels.github.io/recopy/
- One client only: `https://todels.github.io/recopy/?client=burst`
- One template: `https://todels.github.io/recopy/#burst/new-trader`
- Bare 1:1 render (for checks): `?bare#burst/new-trader`

Edits autosave in the visitor's browser (localStorage). Export is `html-to-image` (vendored in `lib/`), 1x or 2x.

## Run locally

```bash
python3 -m http.server 5214 --directory .
```

## Adding a template

1. Pull the design from Figma (frame node), download its assets into `templates/<client>/assets/`.
2. Write `templates/<client>/<template>.html`: one root element with the client class, absolute geometry from Figma, live text instead of outlined text. Template-only CSS goes in a `<style>` at the bottom, class names prefixed per template.
3. Mark what clients can change:
   - `data-field="key" data-label="Label"` on text. Same key on several elements keeps them in sync. `data-multiline` for wrapping copy, `data-order` to sort the panel.
   - `data-image="key" data-label="Label"` on an `<img>` that can be replaced.
   - `data-fit="maxWidthPx"` (and/or `data-fit-h`) so long copy shrinks. Default scales the element; `data-fit-mode="font"` shrinks the font size so pills and rows reflow.
4. Register it in `templates/index.js`.
5. Check it against the Figma render at 1:1 with the `?bare` URL.

## Fonts

`fonts/fonts.css` declares every family; files live next to it.

- Nunito: OFL, hosted here (`fonts/nunito/`).
- ABC Ginto Nord Rounded Trial: private trial build, not in this repo. The CSS uses the installed copy (`local()`), so it renders on machines that have it installed. Everyone else gets a fallback until a licensed file is added.
