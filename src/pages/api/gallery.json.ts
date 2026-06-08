import type { APIRoute } from "astro";
import { readdirSync } from "fs";
import { join } from "path";

export const GET: APIRoute = () => {
    const galerieDir = join(process.cwd(), "public", "assets", "galerie");

    const folders = readdirSync(galerieDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(folderEntry => {
            const folderPath = join(galerieDir, folderEntry.name);
            const images = readdirSync(folderPath, { withFileTypes: true })
                .filter(f => f.isFile())
                .map(f => f.name)
                .filter(n => /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(n))
                .sort();

            const fname = folderEntry.name;
            const displayName = fname.split('_').slice(1).join(' ');
            const order = parseInt(fname.split('_')[0], 10);  // extract leading number

            return {
                name: displayName,
                folderRaw: fname,
                url: `/assets/galerie/${encodeURI(fname)}`,
                images,
                order,  // attach it temporarily
            };
        })
        .sort((a, b) => a.order - b.order)  // sort numerically
        .map(({ order, ...rest }) => rest);  // strip order before returning

    return new Response(JSON.stringify(folders), {
        headers: { "Content-Type": "application/json" },
    });
};