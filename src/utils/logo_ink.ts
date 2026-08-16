import sharp from 'sharp';
import path from 'node:path';

/**
 * Pe ce fundal trebuie asezata o sigla ca sa se vada.
 *
 * Siglele sponsorilor sunt in majoritate PNG/WEBP transparente cu cerneala
 * inchisa (22 din 29 la ultima masuratoare): pe cardul intunecat al site-ului
 * dispar aproape complet — ING era practic invizibil. Altele sunt scrise in
 * alb si ar disparea exact invers, pe o placa deschisa.
 *
 * Nu exista un fundal bun pentru amandoua, deci fiecare sigla il primeste pe
 * al ei. Alegerea se face automat la build, nu cu un steag pus de mana pentru
 * fiecare sponsor — un steag uitat inseamna o sigla invizibila pe site.
 */

/**
 * Peste pragul asta sigla e considerata "deschisa" si ramane pe cardul
 * intunecat; sub el primeste placa deschisa.
 *
 * Pragul e sus dinadins. Prima varianta il pusese la mijlocul dintre cele
 * doua fundaluri (~137), adica "pe care fundal are sigla mai mult contrast".
 * Sunt doua motive pentru care nu e criteriul bun:
 *
 *  - Siglele de firma sunt desenate pentru hartie, deci pentru alb. O sigla
 *    de tonuri medii se citeste bine pe alb chiar daca aritmetic ar avea cu
 *    cateva procente mai mult contrast pe negru.
 *  - Un perete de sponsori cu placi amestecate arata neingrijit. Cu pragul
 *    la mijloc, o singura sigla din 17 (una de 140, la o unitate de prag)
 *    ramanea pe fundal intunecat si strica sirul.
 *
 * Asa ca placa deschisa e regula, iar exceptia e strict sigla care chiar ar
 * disparea pe ea: cerneala aproape alba.
 */
const THRESHOLD = 200;

/** Pixelii sub alfa asta sunt considerati transparenti si nu se numara. */
const ALPHA_CUTOFF = 128;

const cache = new Map<string, boolean>();

/**
 * `true` daca sigla e desenata cu cerneala inchisa si are nevoie de o placa
 * deschisa dedesubt. La sigla lipsa sau ilizibila raspunde `true`: placa
 * deschisa e alegerea sigura pentru majoritatea siglelor.
 */
export async function needsLightPlate(publicPath: string): Promise<boolean> {
    const cached = cache.get(publicPath);
    if (cached !== undefined) return cached;

    let dark = true;

    try {
        const file = path.join(process.cwd(), 'public', publicPath.replace(/^\/+/, ''));
        const { data, info } = await sharp(file)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        let sum = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += info.channels) {
            if (data[i + 3] < ALPHA_CUTOFF) continue;
            sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            count++;
        }

        if (count > 0) dark = sum / count < THRESHOLD;
    } catch {
        // sigla lipsa sau format pe care sharp nu-l poate citi
    }

    cache.set(publicPath, dark);
    return dark;
}
