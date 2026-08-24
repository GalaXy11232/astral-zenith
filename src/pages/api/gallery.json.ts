import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Lista de albume pentru pagina de galerie.
 *
 * Vine din DOUA surse, in ordinea asta:
 *
 *   1. Folderele de activitati (originals/activitati/<slug>/, servite din
 *      public/assets/activitati/<slug>/). Titlul albumului e chiar titlul
 *      articolului si ordinea e data activitatii — deci galeria si pagina de
 *      activitati nu mai pot ajunge nesincronizate.
 *
 *   2. Albumele vechi din public/assets/galerie/NN_Nume, exact ca pana acum.
 *
 * A doua sursa exista doar cat dureaza mutarea albumelor vechi in folderele
 * activitatilor, una cate una. Pe masura ce muti un album, el dispare din
 * grupul de jos si reapare sus, la data lui. Cand galerie/ ramane gol, sursa
 * a doua si comentariul asta se sterg.
 *
 * Forma returnata ({ name, folderRaw, url, images }) e cea pe care o astepta
 * galerie.astro — nu se schimba, oricare ar fi sursa.
 */

const IMAGINE = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

/* Coperta cardului de activitate nu e o poza de eveniment, deci nu intra in
   album. Fara excluderea asta, toate cele 53 de activitati cu coperta ar fi
   aparut instant in galerie ca albume cu o singura poza. */
const COPERTA = /^cover\.(jpe?g|png|webp|avif|gif)$/i;

function imaginiDin(dir: string, exclude?: RegExp): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter(f => f.isFile())
        .map(f => f.name)
        .filter(n => IMAGINE.test(n))
        .filter(n => !exclude?.test(n))
        .sort();
}

export const GET: APIRoute = async () => {
    /* ── 1. albume din activitati ─────────────────────────────────────── */
    const activitati = (await getCollection("activitati"))
        .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

    const dinActivitati = activitati.flatMap(activitate => {
        const dir = join(process.cwd(), "public", "assets", "activitati", activitate.id);
        const images = imaginiDin(dir, COPERTA);

        // O activitate fara poze proprii nu produce album — pagina de
        // activitati o arata oricum.
        if (images.length === 0) return [];

        return [{
            name: activitate.data.title,
            folderRaw: activitate.id,
            url: `/assets/activitati/${encodeURI(activitate.id)}`,
            images,
        }];
    });

    /* ── 2. albume vechi, neatinse ────────────────────────────────────── */
    const galerieDir = join(process.cwd(), "public", "assets", "galerie");

    const vechi = !existsSync(galerieDir) ? [] : readdirSync(galerieDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(folderEntry => {
            const fname = folderEntry.name;
            return {
                name: fname.split('_').slice(1).join(' '),
                folderRaw: fname,
                url: `/assets/galerie/${encodeURI(fname)}`,
                images: imaginiDin(join(galerieDir, fname)),
                order: parseInt(fname.split('_')[0]),  // prefixul numeric
            };
        })
        .sort((a, b) => b.order - a.order)
        .map(({ order, ...rest }) => rest);

    return new Response(JSON.stringify([...dinActivitati, ...vechi]), {
        headers: { "Content-Type": "application/json" },
    });
};
