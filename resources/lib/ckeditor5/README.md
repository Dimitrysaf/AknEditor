# Vendored CKEditor 5

Source: npm package `ckeditor5`, version `48.3.0`.
Tarball sha256: `e9c427677f64256df729b56bf6cf949314cf814728c498da98ff63a9d5ffc796`

Files taken as-is from the package's `dist/browser/` and `dist/translations/` directories
(the official prebuilt browser bundle — no local build step required):

- `ckeditor5.umd.js` — UMD build, exposes `window.CKEDITOR`.
- `ckeditor5.css`, `ckeditor5-editor.css`, `ckeditor5-content.css` — base/editor/content styles.
- `translations/el.umd.js` — Greek UI strings.

To update: `npm pack ckeditor5@<version>`, extract, replace these files, bump the version above.

## License

GPL 2.0-or-later (dual-licensed with a commercial option; see `LICENSE.md` in this directory).
This extension uses it under the GPL terms — `licenseKey: 'GPL'` is set in
`ext.aknEditor.ckeditor.js` — which displays a small "Powered by CKEditor" badge in the editor
UI, per CKEditor 5's self-hosted open-source terms.
