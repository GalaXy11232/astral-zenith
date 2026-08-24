import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * O activitate = un folder in originals/activitati/, cu tot ce tine de ea
 * inauntru:
 *
 *     originals/activitati/2026-07-03-inchidere-unico/
 *     ├── articol.md      textul (fisierul asta)
 *     ├── cover.webp      coperta cardului — NU intra in albumul din galerie
 *     └── *.jpg           pozele evenimentului, care devin album in galerie
 *
 * De ce sta continutul in originals/ si nu in src/: pozele trebuie sa treaca
 * prin scripts/optimize-images.mjs (originals/ -> public/assets/), iar cerinta
 * a fost ca textul si pozele sa stea in ACELASI folder. originals/ e urmarit
 * de git, deci articolele sunt versionate normal.
 *
 * Campurile sunt cu NUME, nu pe pozitii ("prima linie e data, a doua titlul").
 * Cu pozitii, o linie goala in plus sau un CRLF mutau totul cu un rand si
 * pagina iesea gresita fara nicio eroare; asa, un camp lipsa opreste build-ul
 * si spune in ce fisier e problema.
 */
const activitati = defineCollection({
    loader: glob({
        pattern: '*/articol.md',
        base: './originals/activitati',
        // Fara asta id-ul ar fi "2026-07-03-inchidere-unico/articol".
        // Ne trebuie doar numele folderului: e si slug-ul din URL, si cheia
        // dupa care galeria isi gaseste pozele in public/assets/activitati/.
        generateId: ({ entry }) => entry.split('/')[0],
    }),
    schema: z.object({
        /* Data reala, pentru sortare. Se scrie ISO (2026-07-03) ca sa fie
           ordonabila — textul din card vine din dateLabel. */
        date: z.coerce.date(),

        title: z.string().min(1),

        /* Cum se AFISEAZA data. Exista pentru ca multe activitati tin mai
           multe zile ("16-21 iulie 2026") sau chiar luni, iar asta nu incape
           intr-o singura data. Daca lipseste, pagina formateaza `date` in
           romana si e suficient pentru evenimentele de o zi. */
        dateLabel: z.string().optional(),

        /* object-position pentru coperta, ex. "50% 85%". Necesar pe pozele
           unde incadrarea implicita (center) taie capetele oamenilor. */
        focus: z.string().optional(),

        /* Cale explicita catre coperta, ex. "assets/coperta articole/x.webp".
           Se foloseste doar daca in folder NU exista un fisier cover.*;
           pentru articolele noi e mai simplu sa pui cover.jpg in folder. */
        thumbnail: z.string().optional(),
    }),
});

export const collections = { activitati };
