# Ghid pentru dezvoltatori — site-ul Zenith

Ce trebuie să știi ca să lucrezi la site fără să strici lucruri care au fost
reparate cu efort. Citește măcar primele două secțiuni înainte de primul commit.

---

## 1. Pozele NU se pun direct în `public/assets/`

Asta e cea mai importantă regulă nouă.

```
originals/echipa/Oameni/Popescu Ion.webp    ← pui poza la rezoluție plină AICI
        ↓  npm run images
public/assets/echipa/Oameni/Popescu Ion.webp  ← se generează singură, micșorată
```

`originals/` e **sursa**, urmărită de git. `public/assets/` e **rezultatul
generat**. Dacă pui o poză direct în `public/assets/`, prima rulare de
`npm run images` o poate suprascrie.

În cod referi întotdeauna calea servită, niciodată originalul:

```json
{ "image": "/assets/echipa/Oameni/Popescu Ion.webp" }
```

### Comenzi

| Comandă | Ce face |
|---|---|
| `npm run images` | Generează doar ce s-a schimbat (compară datele fișierelor) |
| `npm run images -- --force` | Regenerează tot |
| `npm run images -- --dry` | Doar raportează, nu scrie nimic |

### De ce există

Pozele de membri erau 2772×3696 pixeli (10 MP) afișate într-un card de 152×203.
Copertile de articole erau 6240×4160 afișate la 760×280. Browserul trebuie să
**decodeze** toți pixelii înainte să-i micșoreze — o poză de 26 MP înseamnă
~104 MB de RAM și sute de milisecunde. La derulare rapidă, coada de decodare se
bloca și pozele apăreau cu întârziere mare.

Fișierele erau mici (56–144 KB, webp comprimă bine), de asta nu se vedea
problema din mărimea lor. Contează pixelii, nu octeții.

| Pagină | Înainte | După |
|---|---|---|
| `/echipa` | 386 MP de decodat | 20 MP |
| `/activitate` | 271 MP | 66 MP |
| Total | 77 MB / 1060 MP | 19 MB / 186 MP |

### Logourile nu se micșorează niciodată

`scripts/optimize-images.mjs` are o listă `NEVER_RESIZE`. Fișierele din aceste
zone se copiază bit-cu-bit, fără nicio reencodare:

```
sponsori/  parteneri/  Branding Zenith/  icons/  rezultate/
Logo_*  Sigla_*  Super Into the Deep*
```

Dacă adaugi un logo într-un folder nou, **adaugă-l și în `NEVER_RESIZE`**.

Scriptul mai are două protecții care nu trebuie scoase:

- `.rotate()` aplică orientarea din EXIF direct în pixeli. `sharp` curăță
  metadatele, deci fără asta pozele făcute cu telefonul ajung întoarse pe site.
- Dacă versiunea nouă iese mai mare decât originalul, se păstrează originalul.
  Se întâmplă la logourile PNG cu paletă indexată, pe care reencodarea în RGBA
  le umflă.

---

## 2. O activitate = un folder

A doua regulă importantă. Activitățile **nu** se mai scriu în
`src/pages/activitate.astro` — pagina aia doar citește și ordonează.

```
originals/activitati/2026-07-03-inchidere-unico/
├── articol.md      textul
├── cover.webp      coperta cardului — NU intră în albumul din galerie
├── DSCF0113.jpg    pozele evenimentului → devin album în /galerie
└── DSCF0027.jpg
```

`articol.md`:

```markdown
---
date: 2026-07-03
dateLabel: 03 iulie 2026
title: Festivitatea de închidere UniCo
focus: 50% 85%
---

Primul paragraf.

Al doilea paragraf, cu text **îngroșat**.
```

| Câmp | Obligatoriu | Ce face |
|---|---|---|
| `date` | da | Data reală, ISO (`AAAA-LL-ZZ`). **Ordinea pe pagină vine de aici**, descrescător |
| `title` | da | Titlul cardului **și** al albumului din galerie |
| `dateLabel` | nu | Cum se afișează data. Necesar la intervale („16-21 iulie 2026"). Fără el, se formatează `date` în română |
| `focus` | nu | `object-position` pentru copertă, ex. `50% 85%`, când încadrarea implicită taie capete |
| `thumbnail` | nu | Cale explicită spre o copertă din altă parte. Se folosește doar dacă în folder **nu** există `cover.*` |

### Ca să adaugi o activitate

1. Creează folderul `originals/activitati/<data>-<nume-scurt>/`.
   Numele folderului e slug-ul: apare în URL ca `/activitate#<nume-folder>`.
2. Scrie `articol.md` după modelul de mai sus. **Salvează în UTF-8** — altfel
   diacriticele ies mojibake.
3. Pune `cover.webp` (coperta) și pozele evenimentului în același folder.
4. `npm run images`
5. Gata. Cardul apare la locul lui după dată, iar pozele devin album în
   `/galerie` sub același titlu.

Un rând gol în text = paragraf nou. Merge `**îngroșat**` și `*înclinat*`.

### Paragrafele sunt `<p>` reale

Înainte textul era scris direct în markup, cu `<br>` între paragrafe, deci
regulile `.card-content-inner :global(p)` din `activity_card.astro` nu se
aplicau niciodată. Acum Markdown produce `<p>`, deci se aplică: indentare,
margini, `line-height`. Dacă schimbi `font-size` sau `line-height` acolo,
schimbă și factorul din `max-height: calc(1.66em * ...)` de la `.card-content`
— altfel previzualizarea taie alt număr de rânduri decât spune
`--preview-lines`.

### Greșelile se văd la build

Schema din `src/content.config.ts` verifică fiecare articol. Un câmp lipsă
oprește build-ul și spune exact unde:

```
[InvalidContentEntryDataError] activitati → 2026-08-30-test
  date: Expected type "date", received "object"
  title: Required
```

### Galeria are două surse

`src/pages/api/gallery.json.ts` compune lista din:

1. **folderele de activități** — titlul albumului e titlul articolului, ordinea
   e data activității. `cover.*` e exclus, iar o activitate fără alte poze nu
   produce album;
2. **`public/assets/galerie/NN_Nume`** — cele 55 de albume vechi, exact ca
   înainte, listate după primele.

Sursa a doua e temporară. Pe măsură ce muți un album vechi în folderul
activității lui, dispare din grupul de jos și reapare sus, la data corectă.
Când `galerie/` rămâne gol, se șterge și sursa a doua din cod.

**Nu pune foldere de activități direct în `public/assets/`** — regula de la §1
e aceeași. Fișierele `.md` rămân în `originals/`, scriptul de imagini nu le
publică.

---

## 3. Tipare Astro care se repetă peste tot

Site-ul folosește `ClientRouter` (navigare tip SPA). Trei consecințe care au
produs deja bug-uri reale:

**Scripturile rulează la fiecare navigare.** Toate au forma:

```js
['astro:page-load', 'DOMContentLoaded'].forEach(ev =>
    document.addEventListener(ev, init)
);
```

Ambele evenimente se declanșează la prima încărcare, deci `init` trebuie să aibă
un guard (`if (el.dataset.initialized === 'true') return;`). Fără el, ascultătorii
se dublează. Exact așa se acumulau ascultători de `scroll` în navbar și de click
pe săgețile din galerie.

**Modulele ES rămân în cache între navigări.** O variabilă la nivel de modul
supraviețuiește ieșirii din pagină. De aceea galeria resetează explicit
`viewMode = DEFAULT_VIEW` la fiecare inițializare — altfel alegerea „grilă"
persista și după ce plecai de pe tab.

**Curățenia se face pe `astro:before-swap`.** Contextele WebGL, timerele și
`IntersectionObserver`-ele trebuie eliberate acolo.

### Capcană: CSS scoped și elemente create din JS

Astro adaugă `data-astro-cid-*` **doar** elementelor din șablon. O regulă ca
`.frame iframe { ... }` devine `.frame[data-astro-cid-x] iframe[data-astro-cid-x]`
și **nu se aplică** unui `<iframe>` creat cu `document.createElement`.

Simptom: elementul apare la dimensiunea implicită, în colțul din stânga sus.

Soluție — `:global()` doar pe descendent, ca să nu scape regula în tot site-ul:

```css
.video-section__frame :global(iframe) { position: absolute; inset: 0; }
```

---

## 4. Galeria (`/galerie`)

Cea mai complicată pagină. Nu o modifica fără să citești asta.

De unde vin albumele (folderele de activități + `galerie/`) e explicat la §2.
Aici e vorba doar despre cum se afișează.

### Cum funcționează

Fiecare categorie e un acordeon: titlul e un buton, iar la apăsare panoul
coboară de sub el. **Un singur folder e deschis odată.** Primul (cel mai recent)
e deschis din start; la fiecare intrare în tab se revine la modul roată.

Butonul de sub indicații comută între **roată** (WebGL) și **grilă** (clasic).
Modul e global pe durata vizitei.

### De ce e construită așa

Prima variantă avea o roată per categorie, toate pe pagină. Nu funcționa:

- Browserele permit **~8–16 contexte WebGL** simultan. 55 de roți însemnau că
  Chrome le distrugea pe cele vechi și roțile de sus deveneau negre.
- Un folder de 20 de poze cerea **~1,4 GB de memorie video**: texturi la
  rezoluție plină, fiecare poză urcată de două ori (planurile duplicate aveau
  fiecare propria textură), plus mipmaps.

Acum există **o singură instanță `CircularWheel`** pentru toată pagina, mutată
între secțiuni cu `attach()` / `detach()`. Un context WebGL, ~22 MB de VRAM.

**Nu reintroduce mai multe roți simultan.** Dacă ai nevoie de asta, va trebui o
singură pânză partajată cu `gl.scissor` per roată — mai complicat decât pare,
fiindcă `render()` din `ogl` își forțează viewportul la fiecare apel.

### `src/utils/circular_gallery.ts`

Port vanilla după `CircularGallery` de la React Bits, cu `ogl`. Diferențe
intenționate față de original — nu le anula:

| Schimbare | Motiv |
|---|---|
| Fără deplasare pe `z` în vertex shader | Efectul de val cerea plan cu 100×50 segmente = ~10.000 triunghiuri per poză. Acum 2. |
| Evenimente pe container, nu pe `window` | Originalul mișca galeria la orice drag din pagină |
| Fără handler de `wheel` | Originalul fura scroll-ul vertical al paginii |
| Randare la cerere | Bucla se oprește când roata stă pe loc |
| Texturi partajate + micșorate la 640px | Vezi calculul de VRAM de mai sus |
| Mutarea buclei infinite **înainte** de desenare | Originalul o aplica după, deci poziția corectă apărea abia la cadrul următor. Cu randare la cerere acel cadru nu mai venea și jumătate de roată rămânea nedesenată. |
| Selecția pe `click`, nu pe `pointerup` | Vizualizatorul ascultă `mouseup` pe `body` ca să se închidă; ordinea e `pointerup → mouseup → click`, deci deschiderea pe `pointerup` se anula singură |
| Canvas pentru micșorare, nu `createImageBitmap` | Orientarea unui `ImageBitmap` nu e tratată consecvent; toate pozele ieșeau cu susul în jos |

### Grila refolosește aceleași `<img>`

Elementele din `.folder-grid` servesc două scopuri: în modul roată sunt evidența
pe care o citește vizualizatorul la săgețile stânga/dreapta (ascunse, fără `src`,
deci nu descarcă nimic), iar în modul grilă devin chiar grila. Un singur set de
elemente, nimic de ținut sincronizat.

---

## 5. Sistemul de sticlă (`glass`)

Definit o singură dată în `src/stylesheets/global.css`. Folosește-l, nu copia
blocul în componente.

```html
<div class="card glass glass-hover">
    <span class="glass-sheen" aria-hidden="true"></span>
    ...
</div>
```

| Clasă | Rol |
|---|---|
| `.glass` | Sticla propriu-zisă: blur, saturare, bordură, umbre `inset` |
| `.glass-purple` | Variantă cu movul temei dedesubt (slidere, notificări) |
| `.glass-sheen` | Reflexia difuză de sus — **element separat**, nu pseudo-element |
| `.glass-inset` | Suprafață interioară (poze, iconițe) |
| `.glass-hover` | Ridicare + umbră la hover, cu `prefers-reduced-motion` |

Tokeni de text: `--glass-text`, `--glass-text-soft`, `--glass-text-dim`.

**De ce e sheen-ul element separat și nu `::before` pe `.glass`:** e singurul
care primește `overflow: hidden`, deci nu taie conținut care trebuie să iasă din
cutie (tooltipul mentorilor de pe `/echipa`), și nu intră în conflict cu
pseudo-elementele pe care și le definesc componentele (săgețica de la
`.result-card__panel`, bara de accent de la `.stat-card`).

**Când pui `.glass` pe ceva, verifică textul.** Componentele aveau text închis
pe fond deschis; pe sticlă peste fundal întunecat devine ilizibil.

---

## 6. Header

**Etichetele din meniu au traducere scrisă de mână** și sunt marcate
`translate="no"`. Google traducea „Rezultate" la singular și nu avem niciun
control asupra ce scoate. Sunt în `src/components/NavBar.astro`:

```js
{ name: "Rezultate", en: "Results", href: "/rezultate" }
```

Dacă adaugi un link în meniu, adaugă-i și `en`, altfel rămâne în română când
site-ul e pe engleză.

**Comutatorul de limbă** e un singur buton care arată steagul limbii în care
*intri*. Widgetul GTranslate rămâne în pagină — el aduce motorul de traducere și
funcția `doGTranslate` — dar e ascuns prin poziționare, **nu prin `display`**:
`BaseLayout` îi setează `display: flex` inline la fiecare navigare și ar
suprascrie regula.

Steagurile sunt SVG inline, nu emoji — emoji-urile de steag nu se randează pe
Windows.

**Fundalul barei stă pe `nav::before`**, nu pe `nav`, ca să poată fi estompat
spre bază fără să se estompeze și logourile. JavaScript-ul comută clasa
`.is-scrolled`, nu stiluri inline.

---

## 7. Alte lucruri de știut

**Videoclipul de pe prima pagină** folosește o fațadă: până la click se încarcă
doar miniatura (~80 KB), nu tot player-ul YouTube (1,5–2 MB în 10–15 cereri).
Același tipar în `MediaVideo.astro`. Dacă adaugi un video, folosește
`VideoSection`, nu un `<iframe>` direct.

**Notificările de pe prima pagină** salvează în `localStorage` **doar** când
apeși X. Click pe corp le ascunde pentru sesiunea curentă. Pentru testare există
`window.reenable_notifications()` în consolă — șterge toate flag-urile.

---

## 8. Probleme cunoscute, nereparate

Nu sunt regresii — existau înainte și au fost lăsate intenționat.

| Problemă | Unde |
|---|---|
| 16 poze de voluntari lipsesc din `public/assets/echipa/Oameni/` — cardurile lor arată imagine ruptă | `src/pages/api/volunteers.json` |
| Bootstrap CSS+JS încărcat pe fiecare pagină, folosit zero | `BaseLayout.astro:34-35` |
| React + `@astrojs/react` nefolosite (nu există niciun `.tsx`/`.jsx`), generează un chunk nereferențiat | `package.json`, `astro.config.mjs` |
| `<html lang="en">` pe un site integral în română | `BaseLayout.astro:9` |
| Fără `meta description`, Open Graph, sitemap sau `robots.txt` | |
| 10 vulnerabilități npm (8 high, 2 low), din `libvips` prin `sharp` | `npm audit` |

### Reparate între timp

| Era | Acum |
|---|---|
| 4 imagini rupte pe `/news`: prefix `public/` în cale și folderul `67_` în loc de `53_` | corectate |
| Căi relative (`assets/...` fără `/`) — se rupeau pe paginile servite din subfolder, ex. `/rezultate/` | absolute |
| 17 `<img src="">` goale — browserul redescărca pagina curentă ca imagine | cardurile fără copertă nu mai randează `<img>` deloc |
| `claude_card.astro` (copie a lui `sponsor_card.astro`) și `gallery_image.astro`, nefolosite | șterse |
| `coperta articole/` duplicat în `originals/` și `public/assets/` după ce copertile au intrat în folderele activităților | șters |
| `sageata.svg` nefolosit; `sageata_dark/light.svg` existau doar în `public/`, în afara pipeline-ului | vechiul șters, perechea mutată în `originals/` |

---

## 9. Starea repo-ului azi

**Dependință nouă:** `ogl` (WebGL, pentru roata din galerie). `sharp` vine deja
cu Astro, nu s-a instalat separat.

**Fișiere noi:**

```
originals/                      sursa pozelor la rezoluție plină (75 MB)
originals/activitati/           70 de activități: articol.md + coperta + poze
scripts/optimize-images.mjs     pipeline-ul de imagini
scripts/migrate-activitati.mjs  migrarea unică din activitate.astro (istoric)
src/content.config.ts           schema colecției de activități
src/utils/circular_gallery.ts   motorul roții
```

`scripts/migrate-activitati.mjs` și-a făcut treaba o dată și nu se mai rulează —
rămâne doar ca urmă a ce s-a întâmplat cu cele 1314 linii din `activitate.astro`.
Dacă îl rulezi din greșeală, rescrie cele 70 de foldere din vechiul fișier, care
nu mai există.

**Tema deschisă e gata** și e în `main`. Se comută cu butonul din bară, care
pune `data-theme="light"` pe `<html>`. Tokenii se rescriu într-un singur loc, în
`:root[data-theme="light"]` din `global.css` — nu împrăștia culori de temă prin
componente. Stash-ul cu varianta neterminată nu mai există.

---

## Verificări rapide înainte de commit

```bash
npm run build            # rulează întâi npm run images, apoi astro build
npm run preview          # http://localhost:4321
npm run images -- --dry  # dacă ai atins ceva din originals/
```

`npm run build` pornește cu `npm run images`, deci nu poți uita pasul de
optimizare. E incremental (compară datele fișierelor), nu costă nimic dacă n-ai
schimbat poze.

Merită și o trecere prin `/galerie`, `/echipa` și `/activitate` — sunt paginile
cu cele mai multe piese mobile.
