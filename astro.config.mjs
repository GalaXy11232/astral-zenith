// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    /* Domeniul real. Fara el, Astro.site e undefined, iar canonical, og:url si
       og:image ies goale sau relative — adica previzualizarile de link nu
       merg deloc. Tot de aici isi ia si sitemap-ul adresele absolute. */
    site: 'https://zenith.moisil.ro',
    integrations: [sitemap()],
    output: 'static'
});