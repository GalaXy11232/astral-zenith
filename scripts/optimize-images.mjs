/**
 * Genereaza versiunile web ale pozelor: originals/  ->  public/assets/
 *
 * originals/ este SURSA. Acolo pui pozele la rezolutie plina, cu structura de
 * foldere pe care o vrei in public/assets/. Scriptul scrie in public/assets/
 * aceeasi cale, cu aceeasi denumire, dar micsorata pentru web.
 *
 * In cod referi INTOTDEAUNA calea servita, nu originalul:
 *     /assets/echipa/Oameni/Popescu Ion.webp
 *
 * De ce exista: pozele de membri erau 2772x3696 (10 MP) afisate la 152x203, iar
 * copertile de articole 6240x4160 afisate la 760x280. Browserul trebuie sa
 * DECODEZE toti pixelii inainte sa-i micsoreze — o poza de 26 MP inseamna
 * ~104 MB de RAM si sute de milisecunde. La derulare rapida coada de decodare
 * se blocheaza si pozele apar cu intarziere mare.
 *
 *   npm run images           genereaza doar ce s-a schimbat
 *   npm run images -- --force  regenereaza tot
 *   npm run images -- --dry    doar raporteaza, nu scrie
 */
import sharp from 'sharp';
import { readdir, readFile, writeFile, stat, mkdir, copyFile } from 'node:fs/promises';
import { join, extname, dirname, relative } from 'node:path';

const SRC = 'originals';
const OUT = 'public/assets';

// Latura lunga maxima, aleasa ca sa acopere si ecranele retina (2x cat se afiseaza).
// Caile sunt relative la originals/. Prima regula care se potriveste castiga.
const RULES = [
    { prefix: 'echipa/Oameni', maxEdge: 800 },      // card ~152x203
    { prefix: 'coperta articole', maxEdge: 1600 },  // card 760x280
    { prefix: 'echipa', maxEdge: 1600 },            // poze de grup
    { prefix: 'stiri', maxEdge: 1600 },
    { prefix: 'rezultate', maxEdge: 1200 },
    { prefix: '', maxEdge: 1600 },                  // implicit
];

const PROCESSABLE = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Zone care NU se micsoreaza niciodata, indiferent de dimensiune.
 *
 * Logourile si siglele se folosesc si la dimensiuni mari (print, bannere,
 * ecrane retina) si trebuie sa ramana clare. Sunt oricum fisiere mici, cu
 * suprafete plate — nu ele incarca paginile. Se copiaza ca atare.
 */
const NEVER_RESIZE = [
    'sponsori',
    'parteneri',
    'Branding Zenith',
    'icons',
    'rezultate',          // siglele sezoanelor FTC
    'Logo_',
    'Sigla_',
    'Super Into the Deep' // identitatea vizuala a jocului
];

function isProtected(rel) {
    const normalized = rel.split('\\').join('/');
    return NEVER_RESIZE.some(prefix => normalized.startsWith(prefix));
}

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force');

function maxEdgeFor(rel) {
    const normalized = rel.split('\\').join('/');
    return RULES.find(r => normalized.startsWith(r.prefix)).maxEdge;
}

async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(path);
        else yield path;
    }
}

async function encode(pipeline, ext) {
    switch (ext) {
        case '.png': return pipeline.png({ compressionLevel: 9 }).toBuffer();
        case '.webp': return pipeline.webp({ quality: 82 }).toBuffer();
        default: return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
}

async function isUpToDate(src, out) {
    if (force) return false;
    try {
        const [a, b] = await Promise.all([stat(src), stat(out)]);
        return b.mtimeMs >= a.mtimeMs;
    } catch {
        return false; // out lipseste
    }
}

let scanned = 0, resized = 0, copied = 0, skipped = 0, kept = 0;
let bytesIn = 0, bytesOut = 0, mpIn = 0, mpOut = 0;

for await (const src of walk(SRC)) {
    scanned++;
    const rel = relative(SRC, src);
    const out = join(OUT, rel);
    const ext = extname(src).toLowerCase();

    if (await isUpToDate(src, out)) { skipped++; continue; }
    if (!dry) await mkdir(dirname(out), { recursive: true });

    // SVG, ICO si orice altceva ce nu se poate redimensiona raster: copiem
    if (!PROCESSABLE.has(ext)) {
        if (!dry) await copyFile(src, out);
        copied++;
        continue;
    }

    const input = await readFile(src);
    const meta = await sharp(input).metadata();
    const size = input.length;

    if (!meta.width || !meta.height) {
        if (!dry) await copyFile(src, out);
        copied++;
        continue;
    }

    // EXIF poate declara latimea si inaltimea inversate fata de pixelii bruti
    const flipped = (meta.orientation ?? 1) >= 5;
    const width = flipped ? meta.height : meta.width;
    const height = flipped ? meta.width : meta.height;

    bytesIn += size;
    mpIn += (width * height) / 1e6;

    const maxEdge = maxEdgeFor(rel);
    const longest = Math.max(width, height);

    if (isProtected(rel) || longest <= maxEdge) {
        if (!dry) await copyFile(src, out);
        copied++;
        bytesOut += size;
        mpOut += (width * height) / 1e6;
        continue;
    }

    const output = await encode(
        sharp(input)
            // .rotate() fara argument aplica orientarea din EXIF direct in pixeli.
            // Obligatoriu: sharp curata metadatele, deci fara asta pozele facute
            // cu telefonul ar ajunge intoarse pe site.
            .rotate()
            .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }),
        ext
    );

    // Logourile PNG cu paleta indexata ies mai mari dupa reencodarea in RGBA.
    // Daca versiunea noua nu e mai mica, pastram originalul — sunt oricum
    // imagini de 1-2 MP, unde decodarea nu e o problema.
    if (output.length >= size) {
        if (!dry) await copyFile(src, out);
        kept++;
        bytesOut += size;
        mpOut += (width * height) / 1e6;
        continue;
    }

    if (!dry) await writeFile(out, output);
    resized++;
    bytesOut += output.length;
    const scale = maxEdge / longest;
    mpOut += (width * scale * height * scale) / 1e6;

    console.log(
        `  ${String(width).padStart(4)}x${String(height).padEnd(4)} -> ${String(maxEdge).padEnd(4)}  ` +
        `${(size / 1e6).toFixed(2)}MB -> ${(output.length / 1e6).toFixed(2)}MB  ${rel}`
    );
}

console.log(`\n${dry ? '[dry run] ' : ''}${scanned} fisiere in ${SRC}/`);
console.log(`  ${resized} redimensionate, ${copied} copiate ca atare (logouri incluse), ${kept} pastrate (reencodarea le facea mai mari), ${skipped} deja la zi`);
if (bytesIn) {
    console.log(`  descarcare: ${(bytesIn / 1e6).toFixed(0)} MB -> ${(bytesOut / 1e6).toFixed(0)} MB`);
    console.log(`  de decodat: ${mpIn.toFixed(0)} MP -> ${mpOut.toFixed(0)} MP`);
}
