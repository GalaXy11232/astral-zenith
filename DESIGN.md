# Identitatea vizuală — site-ul Zenith

Cum arată site-ul și **de ce** arată așa. `README.md` spune cum lucrezi (poze,
activități, capcane Astro); documentul ăsta spune ce reguli vizuale respecți când
atingi CSS, o componentă sau o pagină.

Sursa de adevăr rămâne codul — în primul rând `src/stylesheets/global.css`, unde
fiecare valoare are lângă ea motivul. Aici sunt regulile adunate într-un loc, cu
trimitere la fișierul unde trăiesc.

---

## 0. Principiul de bază

**Componentele citesc numai tokeni semantici.** Nu scara de brand direct, nu hex
scris de mână, nu `rgba(255, 255, 255, 0.12)` inventat pe loc.

Nu e o regulă de stil, e ce face tema deschisă posibilă: întreaga temă e **un singur
bloc**, `:root[data-theme="light"]` din `global.css`, care rescrie tokenii. O culoare
scrisă direct într-o componentă nu se întoarce la schimbarea temei — rămâne mov
deschis pe fond alb sau alb pe alb. Înainte de curățenie existau ~65 de valori
`rgba(255,255,255,…)` / `rgba(0,0,0,…)` scrise de mână prin componente, fiecare cu
alfa puțin diferit; tema deschisă era imposibilă până nu au devenit tokeni.

Excepțiile (culori care chiar nu țin de temă) sunt listate la §9 și au fiecare
token propriu, ca să nu pară hardcodări uitate.

---

## 1. Scara de brand — indigo / violet

Definită o singură dată în `:root`, în `global.css`.

| Token | Valoare | Rol tipic |
|---|---|---|
| `--brand-950` | `#130436` | derivat — cel mai adânc; voaluri, gradient de footer |
| `--brand-900` | `#1e0759` | derivat — fundalul barei, ancora hexagoanelor |
| `--brand-800` | `#37079f` | `--primary`; text mov pe tema **deschisă** |
| `--brand-700` | `#4b219d` | hover, linkuri de meniu pe tema deschisă |
| `--brand-500` | `#8453e5` | `--accent`; text mov pe tema **întunecată** |
| `--brand-400` | `#a77aff` | sublinierea linkului activ, hover de accent |
| `--brand-300` | `#bb99ff` | capătul deschis al gradientului |
| `--brand-200` | `#c6a9ff` | linkurile din bară, textul de corp pe sticlă |
| `--brand-100` | `#d4c0fa` | text „soft" pe sticlă, nivel `partener` |
| `--brand-050` | `#ddcff8` | text pe fundal mov plin |

Pașii au salturi clare de luminozitate. Paleta primită avea patru indigo-uri
practic identice (`#37079f`, `#3d0ba3`, `#3b09a1`, `#3b08a1`) — s-a păstrat unul.
`950` și `900` sunt derivate, fiindcă paleta nu avea nimic mai închis, iar footerul și
meniul mobil au nevoie de tonuri adânci.

### Tripletele `-rgb`

Fiecare treaptă are și forma `--brand-500-rgb: 132 83 229`, pentru culori cu alfa:

```css
background: rgb(var(--brand-500-rgb) / 0.4);
```

Canalele sunt separate prin **spațiu**, nu prin virgulă: doar sintaxa modernă
`rgb(R G B / A)` acceptă și `var()` și alfa după slash. Cu virgule ar ieși
`rgb(19, 4, 54 / 0.55)`, pe care browserul o aruncă tăcut. Dacă ai nevoie de alfa,
folosește tripletul — **nu** scrie `rgba(132, 83, 229, .4)`.

---

## 2. Tokeni semantici

Ăștia sunt cei pe care îi folosesc componentele.

| Grup | Tokeni |
|---|---|
| Brand | `--primary`, `--primary-hover`, `--accent`, `--accent-hover`, `--accent-text` |
| Fundaluri | `--page-bg` (`#0b0714`), `--surface-dark`, `--surface-dark-2`, `--bg-light`, `--surface` |
| Text | `--text-on-light`, `--text-muted-light`, `--text-on-dark`, `--text-muted-dark`, `--link-on-light` |
| Gradient | `--purple_hgradient` (alias `--brand_hgradient`) |
| Sticlă | vezi §5 |
| Bară | `--navbar_bg_color`, `--navbar_bg_filter`, `--navlink_color`, `--navlink_underline_color`, `--navlink_hover_color`, `--navlink_hover_shadow`, `--nav-btn-*`, `--nav-divider`, `--mobile-nav-*`, `--mobile-scrim` |
| Altele | `--footer-bg`, `--scrim`, `--focus-ring`, `--icon-bubble-bg` |

**Fundalurile întunecate nu sunt gri.** `--page-bg`, `--surface-dark` și
`--surface-dark-2` sunt aceeași nuanță indigo ca brandul, foarte desaturată — arată
la fel de „negru", dar aparțin paletei. Înainte erau șase griuri neutre diferite
(`#111`, `#0d0d12`, `#222`…), niciunul legat de temă.

**Gradientul variază luminozitatea, nu nuanța.** `--purple_hgradient` merge
`brand-500 → brand-300` pe întuneric și `brand-500 → brand-800` pe deschis. Vechiul
mov → magenta atrăgea atenția asupra lui însuși; o singură familie de culoare
citește mai sobru. Același motiv pentru care `.glass-purple` nu mai alunecă spre
magenta.

---

## 3. Cele două teme și regula de inversare

**Întunericul e implicit.** Tema deschisă se activează cu `data-theme="light"` pe
`<html>`, pus de discul cu soare/lună din bară și salvat în `localStorage.theme`.

Două locuri din `BaseLayout.astro` țin tema în viață și **nu se scot**:

- un `<script is:inline>` sincron, primul în `<head>`, care pune atributul înainte
  de prima pictură — altfel pagina clipește o dată în tema greșită;
- un ascultător pe `astro:after-swap` care îl repune — `ClientRouter` înlocuiește
  atributele lui `<html>` cu cele din HTML-ul static, deci fără el tema sare pe
  întuneric la fiecare link intern (dar **nu** la reîncărcare, ceea ce face bugul
  greu de văzut).

### Regula de inversare

Același mov nu poate fi text pe ambele fundaluri:

| | pe `#0b0714` (întuneric) | pe `#f6f3fd` (deschis) |
|---|---|---|
| `--brand-800` | ~1.6:1 — **ilizibil** | ~11:1 |
| `--brand-500` | ~4.1:1 | ~3.4:1 — sub AA |

Deci textul mov folosește capete opuse ale scării în cele două teme. Un singur
token duce inversarea: **`--accent-text`** (`brand-500` pe întuneric, `brand-800`
pe deschis). Orice text mov — titluri de secțiune, cifre de statistici, titlul de
pe `/contact`, accente în carduri — folosește `--accent-text`, nu `--accent` și nu
o treaptă din scară. `--accent` e o **umplere**, alt rol.

Aceeași regulă dictează și gradientul, sublinierea linkului activ (`brand-400` pe
întuneric, `brand-700` pe deschis, unde `brand-400` ar da ~2.2:1) și aureola de
hover din bară (pe deschis dispare — semnalul firesc pe fundal luminos e
contrastul, nu strălucirea).

### Ce mai schimbă tema deschisă

Pe lângă tokeni, sunt câteva reguli țintite la finalul blocului de temă din
`global.css`, fiecare cu motivul scris lângă ea: conturul cutiilor de sticlă de
pe `/activitate` și `/echipa` (2px, `brand-700` la 0.75 — la alfa mic linia
dispărea), conturul cardurilor de sponsor (1px, fiindcă au dimensiune fixă și
grosimea s-ar scădea din interior), cardurile glisante cu alfa tăiat la o treime,
butonul „Înapoi sus" și X-ul notificărilor. Dacă adaugi o excepție de temă, pune-o
**acolo**, cu motivul, nu în componentă.

---

## 4. Tipografie

**Font: `Prompt`**, de la Google Fonts, greutățile **400, 500, 600, 700, 800**,
fără italic. URL-ul nu are axa `ital,` — fără ea, un `<em>` rătăcit nu poate cere o
față în plus, browserul îl înclină sintetic. Nu adăuga greutăți fără să le și
folosești. Fallback-ul e `sans-serif` (era `monospace` și, la font neîncărcat,
toate titlurile treceau pe Courier).

`body` are `line-height: 1.5`.

### Scara

| Rol | Mărime | Greutate | Unde |
|---|---|---|---|
| Motto hero | `clamp(2.4rem, 6.5vw, 5rem)` | 800 | `main/hero_section.astro`, `letter-spacing: -0.03em` |
| Titlu pagină contact | `clamp(2.2rem, 5vw, 4rem)` | — | `pages/contact.astro` |
| Titlu de secțiune | `clamp(25px, 2.5vw + 1rem, 34px)` | 600 | `.title-underline` |
| Cifră de statistică | `clamp(2.1rem, 4vw, 2.65rem)` | 700 | `stats_card.astro`, `tabular-nums` |
| Titlu de card | ~1.15–1.5rem | 700 | activitate, rezultat, presă |
| Corp | **1.07rem** | 400 | paragrafele din carduri — peste minimul de 16px |
| Linkuri din bară | 1rem | 700 | `uppercase`, `letter-spacing: .07em` |

### Eticheta monospace — semnătura site-ului

Textele mici de context sunt **monospace** (`ui-monospace, 'Cascadia Code', monospace`),
**0.65–0.78rem**, greutate **600**, `uppercase`, `letter-spacing` **0.1–0.22em**, în
culoarea de accent: eyebrow-ul din hero („FTC Team #19084"), data unui eveniment din
presă, `.me-section-label`, sursa unui link de presă. Folosește același tratament
pentru orice „metadată" nouă (dată, categorie, sursă) — nu inventa o a doua formă.

### Titlurile de secțiune

```html
<div class="title-container">
    <h2 class="title-underline">Rezultatele echipei</h2>
</div>
```

`.title-underline` e `inline-block` (nu `block`), ca linia gradient de dedesubt —
50% lățime, `.25em` grosime — să se măsoare din **text**, nu din toată lățimea
paginii. Fiecare pagină are un `<h1>`; unde designul nu prevede unul vizibil, e
`<h1 class="sr-only">`.

---

## 5. Sistemul de sticlă (`glass`)

Materialul tuturor „cutiilor" de pe site. Definit **o singură dată** în `global.css` —
folosește clasele, nu copia blocul.

```html
<div class="card glass glass-hover">
    <span class="glass-sheen" aria-hidden="true"></span>
    ...
</div>
```

| Clasă | Ce face |
|---|---|
| `.glass` | Gradient de sticlă, `backdrop-filter: blur(22px) saturate(170%)`, bordură 1px, umbră + două muchii `inset` (speculară sus, grosime jos) |
| `.glass-purple` | Același material cu movul temei dedesubt — cardurile glisante, notificările. Vine **după** `.glass` |
| `.glass-sheen` | Reflexia difuză de sus — **element separat** |
| `.glass-inset` | Suprafață interioară (poze, iconițe, panouri imbricate), blur 6px |
| `.glass-hover` | Ridicare `translateY(-6px)` + umbră cu halou `brand-500`, anulată la `prefers-reduced-motion` |

**Tokenii de rol** — singurele valori de alb/negru translucid permise:

| Token | Întuneric | Rol |
|---|---|---|
| `--glass-gradient` | alb 0.16 → 0.06 → `brand-500` 0.10 | textura sticlei |
| `--glass-fill` | alb 0.07 | panouri imbricate, suprafețe |
| `--glass-fill-strong` | alb 0.14 | hover, separatoare |
| `--glass-hilite` | alb 0.30 | muchia speculară de sus |
| `--glass-border` / `-hover` | alb 0.20 / 0.34 | bordura |
| `--shadow-soft` / `-strong` | negru 0.30 / 0.50 | umbra în repaus / la hover |
| `--glass-text`, `-soft`, `-dim`, `--glass-body` | alb, `brand-100`, `brand-200`, `brand-200` | textul de pe sticlă |

Pe tema deschisă albul peste alb dispare, deci umplerea și bordurile se tintează
cu indigo, iar umbrele devin indigo foarte diluat (negrul pe fundal deschis iese
gri-murdar). Doar reflexia de sus rămâne albă — acolo albul e chiar efectul.

**De ce sheen-ul e element, nu `::before` pe `.glass`:** e singurul care primește
`overflow: hidden`, deci nu taie conținut care trebuie să iasă din cutie (tooltipul
mentorilor), și nu se bate cu pseudo-elementele componentelor (săgețica de la
`.result-card__panel`, bara de accent de la `.stat-card`).

**Când pui `.glass` pe ceva, verifică textul.** Textul închis gândit pentru fundal
deschis devine ilizibil pe sticlă peste fundal întunecat.

---

## 6. Fundalul cu hexagoane

`src/components/hexbackground.astro` — o pânză WebGL (`three`) cu hexagoane 3D sub
tot conținutul, pe fiecare pagină. Culorile vin din tokeni:

| Token | Întuneric | Deschis |
|---|---|---|
| `--hex-palette` | `#120436 … #2a0a7c` (ancorat pe `brand-900`) | `#c6a9ff … #d4c0fa` (`brand-200` → `brand-100`) |
| `--hex-opacity` | 0.85 | 0.95 |
| `--hex-ambient` | 1.4 | 1.6 |
| `--hex-fog` | `#0b0714` (= `--page-bg`) | `#f6f3fd` |
| `--hex-dir-1` / `-2` | `#8c55f7` / `#7c46e5` | `#c6a9ff` / `#8453e5` |

Trei reguli care **nu** se încalcă:

1. **Valorile se scriu literal, nu ca `var(--brand-*)`.** Componenta le citește cu
   `getPropertyValue`, care întoarce textul declarat fără să rezolve `var()`, iar
   three.js n-ar ști ce să facă cu el.
2. **Treptele paletei variază doar luminozitatea** (H și S fixe), nu se obțin
   amestecând cu alb — amestecul prăbușea saturația la gri-violet.
3. **Ambele lumini direcționale stau pe aceeași nuanță.** Două nuanțe diferite,
   însumate peste albedo, trag rezultatul spre gri.

Ambientul nu e decorativ: three.js împarte iradianța la π, deci totalul
intensităților trebuie să fie ~π ca hexagoanele să iasă chiar în culoarea paletei.
Ceața e fundalul paginii, ca hexagoanele depărtate să se topească în el.

---

## 7. Formă, spațiu, mișcare

### Raze

| Rază | Unde |
|---|---|
| 24px | cardul de membru |
| 20px | `.swiper-slide`, `.me-block` (presă), `.stat-card` (1.25rem) |
| 18px | cardul de activitate, cardul de sponsor |
| 16px | poza de membru, panoul de rezultat (1rem), poze în lightbox |
| 12px | `--radius-sm` — linkuri și miniaturi din presă, siglele de rezultat |
| 999px / 100px | pastile: data unui rezultat, insigne |
| 50% | discurile din bară, butonul „Înapoi sus" |

O rază nouă ar trebui să fie una din astea. Cardul de sponsor era singurul la 14px
și a fost adus la 18px, ca cel de activitate.

### Lățimi de conținut

Cardul de presă `max-width: 860px`, cardul de activitate `760px`, ambele centrate cu
`margin: 0 auto`. Cardul de sponsor e pătrat, `--card-size: clamp(140px, 20vw, 200px)`.
Paddingul de card e fluid, `clamp(18px, 4vw, 32px)`.

### Breakpointuri

| Lățime | Ce se întâmplă |
|---|---|
| `≤ 1080px` | linkurile din bară dispar, apare hamburgerul |
| `≤ 700px` | titlurile de secțiune și cardurile glisante se strâng; statisticile și membrii trec pe două coloane |
| `≤ 520px` | sigla școlii din bară se micșorează |
| `≤ 500px` | grilele din presă trec pe o coloană |

### Curbe de mișcare

| Curbă | Unde |
|---|---|
| `cubic-bezier(0.175, 0.885, 0.32, 1.275)` — ease-out back (`--transition_overshoot`) | `.scale-hover`, sublinierea linkurilor — mișcări mici, jucăușe |
| `cubic-bezier(0.22, 1, 0.36, 1)` — ease-out expo | presă, hero — intrări și ridicări calme |
| `cubic-bezier(0.25, 1, 0.5, 1)` | `.glass-hover`, 0.3s |
| `cubic-bezier(0.445, 0.05, 0.55, 0.95)` — ease-in-out sine | bara: fundalul la scroll, culoarea linkurilor |
| `cubic-bezier(0.215, 0.610, 0.355, 1)` | sertarul mobil și voalul lui |

Durate: 0.25–0.38s pentru interacțiuni; zoom-ul lent al bannerelor la hover e 5s,
intenționat. **Orice mișcare nouă are bloc `@media (prefers-reduced-motion: reduce)`.**

---

## 8. Accesibilitate — reguli care nu se negociază

- **Contrast WCAG AA** (≥ 4.5:1) pentru text. Rapoartele sunt deja calculate în
  comentariile din `global.css`; când alegi o culoare de text, calculează-l și
  scrie-l lângă ea, ca acolo.
- **Ținte de apăsare ≥ 44px.** Discurile din bară au 36px; nu li se mărește
  diametrul (ar dezechilibra bara), ci suprafața de apăsare, cu
  `::after { inset: -5px }`. Hamburgerul și X-ul au padding orizontal din același
  motiv.
- **`.skip-link`** — primul element focusabil, apare doar la focus.
- **`.sr-only`** cu `clip-path: inset(50%)` — **nu** `display: none` sau
  `visibility: hidden`, care l-ar scoate și din arborele de accesibilitate.
- **Focus vizibil:** `--focus-ring` sau `outline: 2px solid var(--glow_color)` pe
  `:focus-visible`.
- **Imagini decorative** cu `alt=""` și `aria-hidden="true"`; imaginile cu conținut
  au `alt` descriptiv (nu „poza").
- **Etichetele de meniu și departamentele** au traducere scrisă de mână și
  `translate="no"` — Google le traducea greșit („Programare" → „Appointment").

---

## 9. Culori care NU vin din temă

Externe, trebuie să rămână așa. Au tokeni ca să fie evidente.

| Token | Motiv |
|---|---|
| `--danger` `#e05252` | stări de eroare |
| `--ftc-into-the-deep` | culoarea sezonului FTC |
| `--yt-red`, `--yt-dark` | butonul de play YouTube din fațada video |
| `--legacy-orange`, `--legacy-orange-dark` | brandingul vechi, în secțiunea de rebranding |
| `--cngm-red`, `--cngm-gold`, `--cngm-black` (+ `-rgb`) | blazonul Colegiului „Grigore Moisil", luate din `Sigla_CNGM.png`; doar caseta de locație de pe `/contact` |
| `--tier-bronze` … `--tier-diamond`, `--tier-partener` | nivelurile de sponsorizare — metale convenționale |

Excepție punctuală acceptată: textul alb (`#fff`) pe pastilele de dată din
`result_card.astro` și pe `.skip-link` — fondul lor e violet închis în **ambele**
teme, deci textul nu e un token de temă.

---

## 10. Catalog per feature

### Bara de navigare — `components/NavBar.astro`, `stylesheets/navbar.css`

Fixă sus, transparentă până la primul scroll; atunci JS-ul pune `.is-scrolled` și
apare fundalul — care stă pe **`nav::before`**, nu pe `nav`, ca să poată fi estompat
spre bază cu o mască (plin până la 76%, stins pe rest) fără să se estompeze și
siglele. Sticlă: `blur(14px) saturate(170%)`.

Stânga: sigla Zenith + sigla CNGM, despărțite de `--nav-divider`. Siglele sunt
**două `<img>` comutate din CSS** (`.logo-dark` / `.logo-light`), nu una schimbată
din JS — comutarea nu clipește la navigare. Dreapta: linkuri `uppercase` 700, cu
sublinierea care apare la hover și rămâne pe pagina activă (`activeLink` e un
**indice** în lista de linkuri); apoi cele două discuri, limbă (steagul limbii în
care *intri*, SVG inline, nu emoji) și temă (pictograma temei în care *intri*).
Sub 1080px: hamburger și un sertar pe tot ecranul, cu voal estompat sub el.

### Hero — `components/main/hero_section.astro`

Eyebrow monospace „FTC Team #19084", motto la 800 cu cuvintele animate pe rând
(`--i`), subtitlu, o linie scurtă de accent. În dreapta, robotul: poză, cu model 3D
(`model-viewer`) încărcat abia la cerere — motorul are 256 KB gzip.

### Notificări — `components/notification_popup.astro`, `notification_stack.astro`

Carduri `.glass-purple` în colț, peste hero, cu miniatură și link către o secțiune
(ex. `/news/#event-istanbul`). Pe telefon 72vw, nu 320px — erau două una peste alta
și acopereau tot hero-ul. X-ul salvează în `localStorage`; click pe corp ascunde
doar pentru sesiune.

### Cardurile glisante „Valorile Noastre" — `pages/index.astro`

Swiper 3D, cardurile `.glass .glass-purple`, 320px lățime, `min-height` (nu
`height` fix — textul englez e mai lung), fără umbră proiectată (stau direct pe
hexagoane, umbra se citea ca o bandă). Pe tema deschisă movul e tăiat la o treime.

### Secțiunea de rebranding — `components/main/rebranding_section.astro`

Sigla veche SovaTech → săgeată animată → sigla Zenith. Săgeata și sigla au variante
separate pe teme, comutate cu aceeași pereche `.logo-dark` / `.logo-light`.

### Video — `components/main/video_section.astro`, `video_text_split_section.astro`

Fațadă: se încarcă doar miniatura (~80 KB) până la click, nu playerul YouTube
(1.5–2 MB). Orice video nou trece prin `VideoSection` / `MediaVideo`, nu `<iframe>`
direct.

### Footer — `components/footer.astro`

`--footer-bg` (gradient `brand-900 → brand-950`; pe deschis `brand-100 → brand-050`),
o linie de shimmer sus, buton rotund „Înapoi sus" pe muchie, rândul de copyright cu
tagline-ul școlii, linkuri cu bulă de iconiță și săgeată.

### Cardul de activitate — `components/activity_card.astro`

`.glass`, 760px, coperta sus (`--thumb-h`, implicit 280px, `focus` controlează
`object-position`), data monospace, titlu 1.15rem, text tăiat la `--preview-lines`
rânduri cu „citește mai mult". Factorul din `max-height: calc(1.66em * …)` depinde
de `font-size` și `line-height` ale paragrafului — se schimbă împreună.

### Cardul de membru — `components/membru_card.astro`, `membri_grid.astro`

`.glass .glass-hover`, 24px rază, poză 3:4 cu 16px rază, nume la 1.2rem, departament
cu traducere scrisă de mână. Pe telefon două pe rând. Mentorii au tooltip care iese
din card (de aici regula cu sheen-ul de la §5).

### Cardul de sponsor — `components/sponsor_card.astro`

Pătrat, `--card-size`, 18px rază, cu fantă (`--notch`) și bandă colorată pe nivel
(`--tier-*`). Sticla e în nuanța **deschisă** de mov, nu cea întunecată din `.glass`:
siglele sunt desenate cu cerneală închisă și pe sticla întunecată jumătate cădeau
sub 3:1. Opacitatea e densă în centru și se subțiază spre margini, ca să rămână
material, nu un dreptunghi plat. Siglele sunt normalizate optic la build
(`utils/logo-metrics.ts`): se măsoară desenul real fără marginea transparentă și se
scalează ca toate să acopere aceeași **suprafață**, nu aceeași înălțime.

### Rezultate — `components/result_card.astro`, `results_timeline.astro`, `stats_card.astro`

Cronologie cu linie verticală și stele, cardurile alternând stânga/dreapta (pe
mobil linia trece pe marginea din stânga). Pozițiile liniei și ale stelelor ies din
trei măsuri (`--rail-pad`, `--star-size`, `--rail-gap`), nu din numere scrise de
mână. Pastila de dată e gradient `brand-700 → brand-800` cu text alb. Statisticile:
cifră mare în `--accent-text`, plină (fără gradient tăiat pe text), cu iconiță într-o
bulă `--icon-bubble-bg`.

### Galeria — `pages/galerie.astro`, `utils/circular_gallery.ts`

Acordeon, un singur folder deschis. Două moduri: **roată** WebGL (`ogl`) și **grilă**.
Există **o singură instanță** de roată pentru toată pagina, mutată între secțiuni —
nu reintroduce mai multe (vezi `README.md` §4). Lightbox propriu
(`gallery_image_visualizer.astro`).

### Presa — `pages/news.astro`, `components/media/*`

Fiecare apariție e un `<MediaEvent>`: `.glass .glass-hover`, 860px, 20px rază, banner
opțional (`clamp(180px, 26vw, 260px)`, zoom lent la hover, gradient care îl dizolvă în
sticlă), dată monospace, titlu, linie de accent de 40px care se lungește la 72px la
hover. Înăuntru: `h3.me-section-label` → `div.me-grid` de `<MediaLink>` (iconiță
de lanț, sursa monospace, titlul articolului tăiat la **două rânduri** cu „…", textul
întreg în `title`; trei pe rând, două sub ~690px de grilă, unul sub 500px de ecran;
un rând incomplet **sub un rând plin** se centrează, dar dacă toate încap pe primul
rând fără să-l umple, rămân la stânga).

**Presa nu are galerii foto.** Pozele unui eveniment stau pe `/activitate` (și de
acolo în `/galerie`); pe `/news` ar fi a doua copie. Un card de presă are doar
coperta și sursele. `MediaImage`, `MediaVideo`, `.me-media-grid` și lightbox-ul din
`MediaEvent` există încă în cod, dar nu sunt folosite.

Ordinea pe pagină e ordinea din sursă, **cel mai recent primul**. `uid` explicit
(`event-<slug>`) = ancora stabilă pentru linkuri din afară.

Singura abatere tipografică de pe site: `.me-title` e pe `system-ui`, nu pe `Prompt`.

### Contact — `pages/contact.astro`, `components/contact/*`, `data/contact-data.ts`

Titlu mare plin în `--accent-text` (era gradient tăiat pe text și jumătatea stângă
dispărea pe întuneric), carduri de metodă de contact cu bulă de iconiță, caseta de
locație care imită blazonul școlii (culorile `--cngm-*`, singurul loc unde apar),
lângă hartă.

---

## 11. Checklist când adaugi ceva vizual

- [ ] Culorile vin din **tokeni**. Niciun hex, niciun `rgba()` scris de mână. Alfa →
      tripletul `-rgb`.
- [ ] Text mov → `--accent-text`. Text pe sticlă → `--glass-text*`.
- [ ] Am verificat în **ambele teme**. O excepție de temă merge în blocul de temă
      din `global.css`, cu motivul scris.
- [ ] Contrastul textului e ≥ 4.5:1 (și l-am scris în comentariu dacă e o alegere nouă).
- [ ] Cutiile folosesc `.glass` + `<span class="glass-sheen">`, nu o copie a
      blocului.
- [ ] Raza e una din scara de la §7. Metadatele (dată, sursă, categorie) au
      tratamentul monospace de la §4.
- [ ] Mișcarea are bloc `prefers-reduced-motion`.
- [ ] Țintele de apăsare au ≥ 44px.
- [ ] Imaginile intră prin `originals/` → `npm run images`, iar în cod se referă
      calea din `public/assets/`.
- [ ] Un link nou în meniu are și `en`; ordinea din `links` e sincronizată cu
      `activeLink` din pagini.
- [ ] Am văzut schimbarea pe localhost, pe desktop și pe lățime de telefon.
