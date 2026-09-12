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
 * Logouri si sigle: suprafete plate, care trebuie sa ramana clare.
 *
 * Regula era "nu se micsoreaza NICIODATA, indiferent de dimensiune", cu
 * motivarea ca sunt oricum fisiere mici si ca s-ar putea folosi la print sau
 * pe bannere. Prima parte nu se verifica, iar a doua nu tine de folderul
 * servit pe web — originalele la rezolutie plina sunt in originals/.
 *
 * Ce iesea din regula: Logo_alb.png si Logo_mov.png ajungeau in public/ exact
 * cum erau, 2344x2000, pentru o caseta de 57x49 din bara de navigare. Amandoua
 * stau in DOM pe FIECARE pagina (schimbarea temei e un `display` din CSS, care
 * nu opreste descarcarea), deci bara costa ~9.4 megapixeli de decodare si
 * ~430 KB la fiecare incarcare. La fel Sigla_CNGM.png: 843x843 si 310 KB
 * pentru 42x42.
 *
 * Deci nu "niciodata", ci "cu rezerva": 1024 pe latura lunga inseamna inca de
 * patru ori cat se afiseaza cel mai mare logo de pe site (199 px), adica
 * acoperit si pe ecrane 2x, si daca cineva mareste caseta de doua ori.
 */
const LOGO_ASSETS = [
    'sponsori',
    'parteneri',
    'Branding Zenith',
    'icons',
    'rezultate',          // siglele sezoanelor FTC
    'Logo_',
    'Sigla_',
    'Super Into the Deep' // identitatea vizuala a jocului
];

const LOGO_MAX_EDGE = 1024;

function isLogo(rel) {
    const normalized = rel.split('\\').join('/');
    return LOGO_ASSETS.some(prefix => normalized.startsWith(prefix));
}

const dry = process.argv.includes('--dry');
const force = process.argv.includes('--force');

function maxEdgeFor(rel) {
    const normalized = rel.split('\\').join('/');
    return RULES.find(r => normalized.startsWith(r.prefix)).maxEdge;
}

/* HEIC si PNG ies ca .webp, deci calea din public/ nu mai e identica cu cea
   din originals/. Tot restul isi pastreaza extensia.

   PNG a intrat aici fiindca encode() il reencoda tot ca PNG, adica nu facea
   nimic pentru exact tipul de imagine pe care WebP il bate cel mai clar:
   capturi de ecran si logouri cu transparenta. Cele sase capturi de la
   "Women in FIRST" erau 1900x981 si ~1 MB bucata.

   Conversia e neconditionata, chiar daca la un logo minuscul WebP poate iesi
   cu cativa octeti mai mare decat PNG-ul: extensia servita trebuie sa fie
   previzibila din calea sursei, altfel nu mai stii ce scrii in <img src>. */
const TO_WEBP = new Set([...HEIC, '.png']);

/* Poza de previzualizare a linkurilor (og:image, vezi BaseLayout.astro).
   Facebook, WhatsApp si Messenger trateaza WebP inconstant acolo, iar o
   previzualizare goala se vede mult mai rau decat jumatate de megaoctet pe
   care oricum nu-l descarca niciun vizitator — doar crawlerul. Ramane PNG. */
const KEEP_FORMAT = new Set(['render.png']);

function outputFor(rel, ext) {
    const normalized = rel.split('\\').join('/');
    const convert = TO_WEBP.has(ext) && !KEEP_FORMAT.has(normalized);
    const target = convert ? rel.slice(0, -ext.length) + '.webp' : rel;
    return join(OUT, target);
}

async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(path);
        else yield path;
    }
}

/*
 * `ext` e extensia de IESIRE, nu cea a sursei — PNG si HEIC ajung amandoua pe
 * ramura .webp (vezi TO_WEBP). Ramura .png a ramas pentru exceptiile din
 * KEEP_FORMAT: fara ea ar cadea pe `default` si am scrie octeti JPEG intr-un
 * fisier .png.
 *
 * `tryLossless` se aprinde pentru sursele PNG, fiindca acolo intra doua feluri
 * de imagine cu optim opus: logouri si sigle (suprafete plate, putine culori)
 * si capturi de ecran. Masurat pe fisierele noastre:
 *
 *     Logo_alb     lossy 59 KB   lossless 54 KB
 *     captura      lossy 125 KB  lossless 668 KB
 *
 * Deci nu exista un raspuns bun pentru amandoua. Le incercam pe amandoua si
 * pastram fisierul mai mic — costa o a doua codare, dar numai pentru PNG-uri,
 * adica vreo sasezeci de fisiere, si numai cand chiar s-au schimbat.
 */
async function encode(pipeline, ext, tryLossless = false) {
    switch (ext) {
        case '.webp': {
            const lossy = await pipeline.clone().webp({ quality: 82 }).toBuffer();
            if (!tryLossless) return lossy;

            const lossless = await pipeline.clone().webp({ lossless: true }).toBuffer();
            return lossless.length < lossy.length ? lossless : lossy;
        }
        case '.png':  return pipeline.png({ compressionLevel: 9 }).toBuffer();
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

let scanned = 0, resized = 0, copied = 0, skipped = 0, text = 0;
let bytesIn = 0, bytesOut = 0, mpIn = 0, mpOut = 0;

for await (const src of walk(SRC)) {
    scanned++;
    const rel = relative(SRC, src);
    const ext = extname(src).toLowerCase();
    const isHeic = HEIC.has(ext);
    const changesFormat = TO_WEBP.has(ext) && !KEEP_FORMAT.has(rel.split('\\').join('/'));
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

    const maxEdge = isLogo(rel) ? LOGO_MAX_EDGE : maxEdgeFor(rel);
    const longest = Math.max(width, height);

    // Nici HEIC, nici PNG nu se pot copia ca atare oricat de mici ar fi: primul
    // fiindca browserul nu l-ar afisa, al doilea fiindca extensia din public/
    // e deja .webp (vezi outputFor) si acolo trebuie sa ajunga chiar WebP.
    // Merg mai departe la reencodare, unde withoutEnlargement le lasa la
    // dimensiunea lor daca sunt deja sub maxEdge.
    if (!changesFormat && longest <= maxEdge) {
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
        changesFormat ? '.webp' : ext,
        ext === '.png'
    );

    // Aici NU se mai intoarce nimeni la original. Exista o regula care copia
    // sursa cand reencodarea iesea mai mare in octeti — dar in punctul asta
    // poza a fost deja micsorata (orice imagine sub maxEdge a iesit mai sus, pe
    // ramura de copiere), asa ca regula arunca redimensionarea ca sa salveze
    // cativa kiloocteti. Exact invers decat ce ne trebuie: ce costa pe telefon
    // e DECODAREA, adica pixelii, nu octetii de pe fir.
    //
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
console.log(`  ${resized} reencodate, ${copied} copiate ca atare (SVG, ICO, poze deja mici), ${skipped} deja la zi`);
if (text) console.log(`  ${text} fisiere de text lasate in originals/ (articole)`);
if (bytesIn) {
    console.log(`  descarcare: ${(bytesIn / 1e6).toFixed(0)} MB -> ${(bytesOut / 1e6).toFixed(0)} MB`);
    console.log(`  de decodat: ${mpIn.toFixed(0)} MP -> ${mpOut.toFixed(0)} MP`);
}
