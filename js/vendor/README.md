`supabase.js` is the official [`@supabase/supabase-js`](https://github.com/supabase/supabase-js)
client (v2.45.4), bundled as a single browser ES module so the site has no runtime dependency
on a CDN and works offline while you develop.

To update it:

```sh
npm i @supabase/supabase-js@latest esbuild
echo 'export { createClient } from "@supabase/supabase-js";' > entry.js
npx esbuild entry.js --bundle --format=esm --target=es2020 --minify \
  --define:process.env.NODE_ENV='"production"' --outfile=js/vendor/supabase.js
```

Licensed MIT by Supabase.
