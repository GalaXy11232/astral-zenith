/**
 * Normalizeaza optic siglele de sponsori, la momentul build-ului.
 *
 * Problema pe care o rezolva: siglele veneau in fisiere foarte diferite si,
 * afisate cu "max-height + max-width", ieseau vizual inegale. Doua cauze se
 * adunau:
 *
 *  1. MARGINE TRANSPARENTA IN FISIER. Multe sigle au spatiu gol in jurul
 *     desenului: la Sharp_Solutions desenul ocupa 245x50 dintr-un fisier de
 *     300x300 (17% din inaltime), la Super Foundation 176x67 din 200x200, la
 *     Laropharm 712x111 din 886x296. Browserul incadreaza FISIERUL, nu
 *     desenul, deci desenul ajungea de 3-6 ori mai mic decat al altora.
 *
 *  2. RAPORT DE ASPECT. Desenele merg de la 0.63 (timesalt, inalt) la 6.41
 *     (Laropharm, foarte lat). Cand limitezi doar inaltimea, siglele late
 *     ies uriase ca suprafata, iar cele patrate ies mici.
 *
 * Impreuna dadeau o diferenta de ~4.3x intre cea mai "mare" si cea mai "mica"
 * sigla, desi toate respectau aceleasi reguli CSS.
 *
 * Solutia: masuram aici, cu sharp, dreptunghiul REAL al desenului (fara
 * marginea goala) si calculam ce dimensiune trebuie sa aiba imaginea ca
 * DESENUL sa acopere mereu aceeasi SUPRAFATA optica. Suprafata, nu inaltimea:
 * asa o sigla lata si una patrata "cantaresc" la fel pentru ochi.
 *
 * De ce nu am taiat direct fisierele: siglele sunt materiale de brand primite
 * de la sponsori, iar unele au spatiul de garda cerut prin ghidul lor de
 * identitate. Le lasam neatinse si compensam la afisare.
 *
 * Rezultatul inlocuieste `scale_factor` scris de mana prin pagina (2.25, 2,
 * 1.4 — nimerite din ochi si valabile doar pentru sigla respectiva).
 */
import sharp from 'sharp';
import { join } from 'node:path';

/**
 * Raportul latime/inaltime al casetei in care asezam sigla. Trebuie sa fie
 * ACELASI numar ca `aspect-ratio` pe `.logo-box` in sponsor_card.astro —
 * altfel incadrarea calculata aici nu corespunde cu cea din pagina.
 * Siglele sunt majoritar late (2.2-6.4), deci si caseta e lata.
 */
export const LOGO_BOX_RATIO = 1.9;

/**
 * Suprafata tinta a desenului, in unitati in care inaltimea casetei = 1
 * (deci suprafata casetei = LOGO_BOX_RATIO = 1.9). 0.80 inseamna ca desenul
 * acopera ~42% din caseta: destul cat sa se citeasca, dar cu aer in jur.
 *
 * Urcat de la 0.62, ca siglele compacte sa nu mai para pierdute in caseta.
 * Creste DOAR ce are loc: cele foarte late sunt deja limitate de plafonul de
 * latime de mai jos, deci raman pe loc (Laropharm, 6.5:1, nu se misca deloc;
 * Sharp Solutions, 5:1, creste 8%), in timp ce cele patrate si compacte cresc
 * cu ~14%. Exact asimetria ceruta: mai mari cele cu spatiu gol in jur, neatinse
 * cele care ating deja marginea.
 */
const TARGET_AREA = 0.80;

export interface LogoMetrics {
    /** Latimea imaginii, ca procent din latimea casetei. */
    widthPct: number;
    /** Inaltimea imaginii, ca procent din inaltimea casetei. */
    heightPct: number;
    /** Cat trebuie mutata imaginea ca CENTRUL DESENULUI sa cada in centrul
     *  casetei, in procente din propria ei dimensiune. */
    offsetXPct: number;
    offsetYPct: number;

    /**
     * Fisierul NU are canal alfa, deci sigla vine lipita pe un dreptunghi
     * colorat (Super Foundation pe rosu, timesalt pe magenta). Nu se poate
     * decupa: in ambele desenul e ALB, deci fara fundal ar ramane alb pe alb.
     * Cardul le afiseaza atunci ca "pastila de brand" — sigla umple placa si
     * ii preia coltul rotunjit — ca dreptunghiul sa para intentionat.
     */
    opaque: boolean;

    /**
     * Nu am putut masura fisierul (cel mai des: lipseste de pe disc). Cardul
     * arata numele sponsorului in locul unei imagini rupte.
     */
    missing: boolean;

    /**
     * Raportul latime/inaltime al FISIERULUI intreg (nu al desenului). Il
     * folosesc pastilele: ele se dimensioneaza pe inaltime, cu latimea `auto`,
     * iar `auto` inseamna 0 pana se descarca imaginea — si toate siglele sunt
     * `loading="lazy"`. Pus ca `aspect-ratio` inline, latimea se stie de la
     * primul cadru, deci nu mai sare asezarea cand intra poza.
     */
    fileRatio: number;
}

/** Sigla masurata o singura data per proces (build-ul si dev-serverul cer
 *  aceleasi fisiere de zeci de ori). */
const cache = new Map<string, LogoMetrics>();

/**
 * Cand nu putem masura fisierul (lipseste, format necunoscut, sharp cade),
 * ne purtam ca si cum desenul ar umple exact fisierul si ar fi centrat:
 * comportamentul vechi, fara normalizare, dar fara sa cada build-ul.
 *
 * Marcam rezultatul cu `missing: true`, iar cardul deseneaza numele
 * sponsorului in locul imaginii — altfel iesea un <img> rupt in pagina.
 * Caderea se raporteaza si in consola: un avertisment aici inseamna ca un
 * sponsor e in sponsors.json fara fisier de sigla pe disc.
 */
const FALLBACK: LogoMetrics = {
    widthPct: 100,
    heightPct: 100,
    offsetXPct: -50,
    offsetYPct: -50,
    opaque: false,
    missing: true,
    fileRatio: 1,
};

function fallbackWithWarning(publicPath: string, reason: unknown): LogoMetrics {
    console.warn(
        `[logo-metrics] Nu am putut masura "${publicPath}" (${reason}). ` +
        `Cardul arata numele sponsorului in loc de sigla.`
    );
    return FALLBACK;
}

export async function getLogoMetrics(publicPath: string): Promise<LogoMetrics> {
    const cached = cache.get(publicPath);
    if (cached) return cached;

    const metrics = await measure(publicPath);
    cache.set(publicPath, metrics);
    return metrics;
}

async function measure(publicPath: string): Promise<LogoMetrics> {
    // `logo` e scris in pagini ca ruta servita ("/assets/sponsori/ing.webp"),
    // iar pe disc sta in public/. Rezolvam fata de radacina proiectului, la
    // fel ca scripts/optimize-images.mjs — sharp vrea o cale string, nu un URL.
    const file = join(process.cwd(), 'public', publicPath);

    let imgW: number;
    let imgH: number;
    let hasAlpha: boolean;
    let contentW: number;
    let contentH: number;
    let offsetLeft: number;
    let offsetTop: number;

    try {
        const meta = await sharp(file).metadata();
        if (!meta.width || !meta.height) {
            return fallbackWithWarning(publicPath, 'fisier fara dimensiuni');
        }
        imgW = meta.width;
        imgH = meta.height;
        // Citit din metadata, care oricum se incarca aici: fara canal alfa =
        // sigla are fundal lipit in fisier. Nu costa o a doua trecere.
        hasAlpha = meta.hasAlpha === true;

        // trim() taie marginea uniforma din jur — transparenta la siglele cu
        // canal alfa, alba la cele fara (ambele exista in public/assets).
        // Ne intereseaza doar CAT a taiat, nu imaginea rezultata.
        const { info } = await sharp(file)
            .ensureAlpha()
            .trim({ threshold: 1 })
            .toBuffer({ resolveWithObject: true });

        contentW = info.width;
        contentH = info.height;
        // sharp raporteaza offseturile ca numere negative (cat a scos din
        // stanga/sus), de aici Math.abs.
        offsetLeft = Math.abs(info.trimOffsetLeft ?? 0);
        offsetTop = Math.abs(info.trimOffsetTop ?? 0);
    } catch (err) {
        return fallbackWithWarning(publicPath, err);
    }

    if (!contentW || !contentH) {
        return fallbackWithWarning(publicPath, 'desen gol dupa trim');
    }

    // --- Cat de mare trebuie sa fie DESENUL ---------------------------------
    // Lucram in unitati in care inaltimea casetei = 1, latimea = ratio.
    const ratio = contentW / contentH;
    let drawH = Math.sqrt(TARGET_AREA / ratio);
    let drawW = drawH * ratio;

    // Siglele foarte late (Laropharm, 6.4:1) ar depasi latimea casetei la
    // suprafata tinta. Le micsoram proportional pana incap — pierd putin din
    // suprafata, dar raman pe acelasi rand optic cu restul.
    const overflow = Math.max(drawW / LOGO_BOX_RATIO, drawH, 1);
    drawW /= overflow;
    drawH /= overflow;

    // --- De la desen inapoi la imaginea intreaga ---------------------------
    // Desenul e doar o parte din fisier, deci imaginea se afiseaza mai mare
    // decat desenul, exact cu cat de multa margine goala are.
    const widthPct = (drawW / LOGO_BOX_RATIO) * (imgW / contentW) * 100;
    const heightPct = drawH * (imgH / contentH) * 100;

    // --- Recentrare --------------------------------------------------------
    // Desenul nu e neaparat in mijlocul fisierului (la aevr e urcat, la
    // dondino e coborat). Asezam imaginea cu coltul in centrul casetei si o
    // tragem inapoi cu pozitia centrului desenului, ca desenul — nu fisierul
    // — sa fie cel centrat.
    const centerX = (offsetLeft + contentW / 2) / imgW;
    const centerY = (offsetTop + contentH / 2) / imgH;

    return {
        widthPct,
        heightPct,
        offsetXPct: -centerX * 100,
        offsetYPct: -centerY * 100,
        opaque: !hasAlpha,
        missing: false,
        fileRatio: imgW / imgH,
    };
}
