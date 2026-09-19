# Showoff Salon, Vercel edition

Same website, booking, admin console and WhatsApp billing as the original zip, changed to run on Vercel.

- `public/` static site and admin pages
- `api/[...path].js` the one serverless function (API and photo delivery)
- `seed.js` starting menu (used only when the data store is empty)
- Data lives in a private Vercel Blob store (bookings, invoices, menu, photos). Nothing is written to disk.

Environment variables: `ADMIN_PASSWORD` (first sign-in only), `SESSION_SECRET` (any 32+ character random string), and `BLOB_READ_WRITE_TOKEN` (added when a Blob store is connected to the project).

Deploy: import this folder as a Vercel project (framework: Other, output directory: public), connect a private Blob store, add the variables above, and turn off Vercel Authentication so the public site can be opened.
