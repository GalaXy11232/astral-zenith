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
import heicConvert from 'heic-convert';
import { readdir, readFile, writeFile, stat, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
    { prefix: 'activitati', maxEdge: 1600 },        // coperti + pozele din galerie
    { prefix: '', maxEdge: 1600 },                  // implicit
];

const PROCESSABLE = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Pozele de pe iPhone vin .HEIC, si HEIC nu se poate servi: doar Safari il
 * afiseaza, restul browserelor arata imagine rupta. Nici sharp nu-l poate
 * deschide — libvips-ul precompilat vine fara decodorul HEVC ("Support for
 * this compression format has not been built in"), deci le decodam intai cu
 * heic-convert (libde265 in WebAssembly, fara dependinte de sistem).
 *
 * Rezultatul se scrie INTOTDEAUNA ca .webp, deci si numele fisierului se
 * schimba in public/assets/. Asta face ca `cover.HEIC` sa ajunga `cover.webp`
 * si sa fie gasit de expresia din activitate.astro, iar pozele sa intre in
 * albumul din galerie — amandoua citesc din public/assets/, nu din originals/.
 *
 * Decodarea costa ~1.3s pentru o poza de 9 MP, de zeci de ori mai mult decat
 * un JPEG. Se plateste o singura data: la a doua rulare fisierul e deja la zi.
 */
const HEIC = new Set(['.heic', '.heif']);

/**
 * Fisiere care stau in originals/ dar NU au ce cauta in public/.
 *
 * Un articol (originals/activitati/<slug>/articol.md) sta in acelasi folder
 * cu pozele evenimentului, pentru ca asta e ideea structurii. Scriptul
 * copiaza altfel orice extensie pe care n-o poate redimensiona, deci fara
 * lista asta articolele ar fi ajuns servite ca fisiere la
 * /assets/activitati/<slug>/articol.md. Textul e randat de pagina, nu livrat
 * ca fisier.
 */
const NEVER_PUBLISH = new Set(['.md', '.txt']);

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

/* HEIC iese ca .webp, deci calea din public/ nu mai e identica cu cea din
   originals/. Tot restul isi pastreaza extensia. */
function outputFor(rel, ext) {
    const target = HEIC.has(ext) ? rel.slice(0, -ext.length) + '.webp' : rel;
    return join(OUT, target);
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

/**
 * Ce s-a schimbat de la ultima rulare: dupa CONTINUT, nu dupa data fisierului.
 *
 * Inainte se comparau datele de modificare (out mai nou decat src => sari
 * peste). Cade in cazul cel mai obisnuit de aici: iei o poza din folder si o
 * redenumesti `cover.webp`. Redenumirea nu schimba data, deci sursa noua
 * pastreaza data pozei vechi, iese mai VECHE decat fisierul generat si
 * scriptul o ignora. Coperta ramanea cea veche pe site, fara niciun mesaj —
 * s-a intamplat de doua ori la 2026-07-16-first-robotics-initiative. La fel
 * pateste orice copiere care pastreaza data (cp -p, dezarhivare, backup).
 *
 * Acum se retine hash-ul continutului fiecarei surse. Alt continut = alt
 * hash = se regenereaza, oricare ar fi data. Manifestul sta langa fisierele
 * pe care le descrie: daca stergi public/assets/, dispare si el, si atunci
 * se regenereaza tot — exact ce trebuie.
 */
const MANIFEST = join(OUT, '.image-manifest.json');

async function loadManifest() {
    if (force) return {};
    try {
        return JSON.parse(await readFile(MANIFEST, 'utf8'));
    } catch {
        return {}; // prima rulare, sau manifest sters odata cu public/assets/
    }
}

function hashOf(buffer) {
    return createHash('sha1').update(buffer).digest('hex');
}

/** Fisierul generat exista inca? Hash-ul potrivit nu ajuta daca out lipseste. */
async function outputExists(out) {
    try {
        await stat(out);
        return true;
    } catch {
        return false;
    }
}

const manifest = await loadManifest();
const nextManifest = {};

let scanned = 0, resized = 0, copied = 0, skipped = 0, kept = 0, text = 0;
let bytesIn = 0, bytesOut = 0, mpIn = 0, mpOut = 0;

for await (const src of walk(SRC)) {
    scanned++;
    const rel = relative(SRC, src);
    const ext = extname(src).toLowerCase();
    const isHeic = HEIC.has(ext);
    const out = outputFor(rel, ext);

    if (NEVER_PUBLISH.has(ext)) { text++; continue; }

    const source = await readFile(src);
    const size = source.length;
    const hash = hashOf(source);
    nextManifest[rel] = hash;

    if (manifest[rel] === hash && await outputExists(out)) { skipped++; continue; }
    if (!dry) await mkdir(dirname(out), { recursive: true });

    // SVG, ICO si orice altceva ce nu se poate redimensiona raster: copiem
    if (!PROCESSABLE.has(ext) && !isHeic) {
        if (!dry) await copyFile(src, out);
        copied++;
        continue;
    }

    // heic-convert scoate un JPEG intermediar, in memorie; de acolo incolo e
    // acelasi drum ca la orice alta poza. libheif aplica singur rotatia din
    // container, deci JPEG-ul iese deja drept.
    const input = isHeic
        ? Buffer.from(await heicConvert({ buffer: source, format: 'JPEG', quality: 1 }))
        : source;

    const meta = await sharp(input).metadata();

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

    // Un HEIC nu se poate copia ca atare oricat de mic ar fi — nu l-ar afisa
    // browserul. Merge mai departe la reencodare, unde withoutEnlargement il
    // lasa la dimensiunea lui.
    if (!isHeic && (isProtected(rel) || longest <= maxEdge)) {
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
        isHeic ? '.webp' : ext
    );

    // Logourile PNG cu paleta indexata ies mai mari dupa reencodarea in RGBA.
    // Daca versiunea noua nu e mai mica, pastram originalul — sunt oricum
    // imagini de 1-2 MP, unde decodarea nu e o problema.
    // Acelasi motiv: chiar daca .webp iese mai mare decat sursa .HEIC (se
    // intampla des, HEIC comprima excelent), tot el trebuie servit.
    if (!isHeic && output.length >= size) {
        if (!dry) await copyFile(src, out);
        kept++;
        bytesOut += size;
        mpOut += (width * height) / 1e6;
        continue;
    }

    if (!dry) await writeFile(out, output);
    resized++;
    bytesOut += output.length;
    const scale = Math.min(1, maxEdge / longest);
    mpOut += (width * scale * height * scale) / 1e6;

    console.log(
        `  ${String(width).padStart(4)}x${String(height).padEnd(4)} -> ${String(maxEdge).padEnd(4)}  ` +
        `${(size / 1e6).toFixed(2)}MB -> ${(output.length / 1e6).toFixed(2)}MB  ${rel}` +
        (isHeic ? '  [HEIC -> webp]' : '')
    );
}

if (!dry) {
    await mkdir(dirname(MANIFEST), { recursive: true });
    await writeFile(MANIFEST, JSON.stringify(nextManifest, null, 0));
}

console.log(`\n${dry ? '[dry run] ' : ''}${scanned} fisiere in ${SRC}/`);
console.log(`  ${resized} redimensionate, ${copied} copiate ca atare (logouri incluse), ${kept} pastrate (reencodarea le facea mai mari), ${skipped} deja la zi`);
if (text) console.log(`  ${text} fisiere de text lasate in originals/ (articole)`);
if (bytesIn) {
    console.log(`  descarcare: ${(bytesIn / 1e6).toFixed(0)} MB -> ${(bytesOut / 1e6).toFixed(0)} MB`);
    console.log(`  de decodat: ${mpIn.toFixed(0)} MP -> ${mpOut.toFixed(0)} MP`);
}
