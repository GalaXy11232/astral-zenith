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

## 2. Tipare Astro care se repetă peste tot

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

## 3. Galeria (`/galerie`)

Cea mai complicată pagină. Nu o modifica fără să citești asta.

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

## 4. Sistemul de sticlă (`glass`)

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

## 5. Header

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

## 6. Alte lucruri de știut

**Videoclipul de pe prima pagină** folosește o fațadă: până la click se încarcă
doar miniatura (~80 KB), nu tot player-ul YouTube (1,5–2 MB în 10–15 cereri).
Același tipar în `MediaVideo.astro`. Dacă adaugi un video, folosește
`VideoSection`, nu un `<iframe>` direct.

**Notificările de pe prima pagină** salvează în `localStorage` **doar** când
apeși X. Click pe corp le ascunde pentru sesiunea curentă. Pentru testare există
`window.reenable_notifications()` în consolă — șterge toate flag-urile.

---

## 7. Probleme cunoscute, nereparate

Nu sunt regresii — existau înainte și au fost lăsate intenționat.

| Problemă | Unde |
|---|---|
| 4 imagini rupte: prefix `public/` în cale **și** folderul greșit (`67_` în loc de `53_`) | `src/pages/news.astro:53-56` |
| 16 poze de membri lipsesc din `public/assets/echipa/Oameni/` (cad pe placeholder) | `src/pages/api/*.json` |
| 17 `<img src>` gol — browserul redescarcă pagina ca imagine | `/activitate`, `/news` |
| Căi relative la assets (`assets/...` fără `/`) — se rup pe URL cu `/` la final | `activitate.astro`, `rezultate.astro`, `rebranding_section.astro` |
| Bootstrap CSS+JS încărcat pe fiecare pagină, folosit zero | `BaseLayout.astro:20-21` |
| React + `@astrojs/react` nefolosite, generează un chunk de 193 KB nereferențiat | `package.json` |
| `<html lang="en">` pe un site integral în română | `BaseLayout.astro:9` |
| Fără `meta description`, Open Graph, sitemap sau `robots.txt` | |
| `claude_card.astro` și `gallery_image.astro` — componente nefolosite | `src/components/` |
| 10 vulnerabilități npm (8 high), fix disponibil prin `npm audit fix` | |

---

## 8. Starea repo-ului azi

**Dependință nouă:** `ogl` (WebGL, pentru roata din galerie). `sharp` vine deja
cu Astro, nu s-a instalat separat.

**Fișiere noi:**

```
originals/                      sursa pozelor la rezoluție plină (75 MB)
scripts/optimize-images.mjs     pipeline-ul de imagini
src/utils/circular_gallery.ts   motorul roții
```

**Există un stash cu o temă light neterminată:**

```
stash@{0}: On main: tema light (WIP, incompleta - tokeni lipsa)
```

Recuperabil cu `git stash pop`. **Nu e gata:** ștergea din `global.css` tokenii
de culoare (`--navlink_color`, `--glow_color`, `--navbar_bg_color`, `--footer-bg`
și încă vreo zece), dar `navbar.css` continua să-i folosească — rezultau șapte
variabile CSS nedefinite, adică meniu fără culoare, bară fără fundal, footer
fără gradient. Butonul care ar fi activat tema nici nu era adăugat încă.

Dacă reiei tema light, pornește de acolo, dar rezolvă întâi tokenii.

---

## Verificări rapide înainte de commit

```bash
npm run build          # trebuie să treacă fără erori
npm run preview        # http://localhost:4321
npm run images -- --dry  # dacă ai atins ceva din originals/
```

Merită și o trecere prin `/galerie`, `/echipa` și `/activitate` — sunt paginile
cu cele mai multe piese mobile.
