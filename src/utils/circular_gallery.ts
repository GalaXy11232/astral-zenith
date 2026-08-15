// Roata de poze — port vanilla dupa CircularGallery de la React Bits (ogl/WebGL).
//
// Diferente fata de originalul React, toate impuse de faptul ca pagina /galerie
// are ~55 de roti una sub alta, nu una singura:
//
//  1. Evenimentele de pointer se leaga de CONTAINER, nu de window. In original
//     un drag oriunde in pagina misca galeria; cu 55 de roti, toate s-ar fi
//     miscat simultan.
//  2. Nu exista handler de 'wheel'. Originalul fura scroll-ul vertical ca sa
//     deruleze galeria — aici ar bloca scrollul normal al paginii.
//  3. Fara clasa Title / incarcare de font. Numele fisierelor (IMG_2657.webp)
//     n-ar spune nimic, iar Figtree ar fi insemnat un fetch la Google Fonts.
//  4. Click pe o poza (drag scurt) trimite indexul ei in sus, ca sa deschidem
//     vizualizatorul existent.

import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl';

export interface WheelItem {
    image: string;
}

export interface WheelDefaults {
    bend?: number;
    borderRadius?: number;
    scrollSpeed?: number;
    scrollEase?: number;
}

function lerp(p1: number, p2: number, t: number): number {
    return p1 + (p2 - p1) * t;
}

function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
    let timeout: number | undefined;
    return function (this: any, ...args: any[]) {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => func.apply(this, args), wait);
    };
}

// Fara deplasare pe z: efectul de val cerea un plan foarte tesselat
// (100x50 segmente = ~10.000 de triunghiuri per poza). Acum planul are
// 2 triunghiuri.
const VERTEX = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FRAGMENT = `
    precision highp float;
    uniform vec2 uImageSizes;
    uniform vec2 uPlaneSizes;
    uniform sampler2D tMap;
    uniform float uBorderRadius;
    uniform float uAlpha;
    varying vec2 vUv;

    float roundedBoxSDF(vec2 p, vec2 b, float r) {
        vec2 d = abs(p) - b;
        return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
    }

    void main() {
        vec2 ratio = vec2(
            min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
            min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
        );
        vec2 uv = vec2(
            vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
            vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
        );
        vec4 color = texture2D(tMap, uv);

        float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
        float edgeSmooth = 0.002;
        float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);

        gl_FragColor = vec4(color.rgb, alpha * uAlpha);
    }
`;


/** Dimensiunea maxima a laturii lungi a unei texturi.
 *  Planul se vede la ~390px pe ecran (700 * inaltime/1500, la dpr 1.5), deci
 *  o textura de 2048px insemna ~25x mai multi pixeli decat pot fi afisati. */
const MAX_TEXTURE_EDGE = 640;

/** Cat dureaza aparitia unei poze dupa ce textura ei a sosit (ms). */
const FADE_MS = 260;

/** Plasa de siguranta impotriva unei bucle infinite daca widthTotal e absurd. */
const MAX_WRAPS = 64;

interface TexEntry {
    texture: any;
    width: number;
    height: number;
    loaded: boolean;
}

/**
 * Texturile sunt partajate intre planurile duplicate ale aceleiasi poze si
 * micsorate inainte de upload. Fara asta, un folder de 20 de poze cerea ~1,4 GB
 * de memorie video (40 de planuri x textura la rezolutie plina).
 */
class TextureStore {
    private entries = new Map<string, TexEntry>();
    private queue: string[] = [];
    private active = 0;
    private disposed = false;

    /** Cate poze mai sunt in coada sau in curs de descarcare. */
    get pending(): number {
        return this.queue.length + this.active;
    }

    constructor(private gl: any, private onReady: () => void) {}

    get(url: string): TexEntry {
        let entry = this.entries.get(url);
        if (entry) return entry;

        entry = {
            // fara mipmaps: textura e deja aproape de dimensiunea de afisare,
            // iar mipmap-urile ar adauga 33% memorie
            texture: new Texture(this.gl, { generateMipmaps: false }),
            width: 1,
            height: 1,
            loaded: false
        };
        this.entries.set(url, entry);
        this.queue.push(url);
        this.pump();
        return entry;
    }

    // Toate pozele folderului pornesc odata. Cu incarcare in loturi, roata se
    // completa in trepte vizibile; acum browserul le multiplexeaza singur.
    private pump() {
        while (!this.disposed && this.queue.length) {
            const url = this.queue.shift()!;
            this.active++;
            this.load(url).finally(() => { this.active--; });
        }
    }

    private async load(url: string) {
        const entry = this.entries.get(url);
        if (!entry || this.disposed) return;

        try {
            const source = await downscale(url);
            if (this.disposed || !this.entries.has(url)) return;
            entry.texture.image = source;
            entry.width = (source as any).width;
            entry.height = (source as any).height;
            entry.loaded = true;
            this.onReady();
        } catch {
            // poza lipsa sau invalida — planul ramane gol
        }
    }

    dispose() {
        this.disposed = true;
        this.queue.length = 0;
        this.entries.forEach(entry => {
            if (entry.texture?.texture) this.gl.deleteTexture(entry.texture.texture);
        });
        this.entries.clear();
    }
}

/**
 * Descarca poza si o micsoreaza la MAX_TEXTURE_EDGE inainte de a ajunge pe GPU.
 *
 * Redimensionarea se face prin canvas, NU prin createImageBitmap. ogl activeaza
 * UNPACK_FLIP_Y_WEBGL, care se comporta corect pentru HTMLImageElement si
 * canvas, dar orientarea unui ImageBitmap nu e tratata consecvent de browsere —
 * cu el, toate pozele ieseau cu susul in jos. Canvasul reproduce exact acelasi
 * asezare a pixelilor ca imaginea originala, deci orientarea e garantata.
 *
 * img.decode() face oricum decodarea in afara firului principal, iar drawImage
 * la scalare e accelerat, deci costul e de ordinul milisecundelor.
 */
async function downscale(url: string): Promise<HTMLCanvasElement | HTMLImageElement> {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();

    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const ratio = Math.min(1, MAX_TEXTURE_EDGE / (longest || 1));

    // deja destul de mica — o folosim ca atare
    if (ratio === 1) return img;

    const width = Math.max(1, Math.round(img.naturalWidth * ratio));
    const height = Math.max(1, Math.round(img.naturalHeight * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return img;

    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
}

interface Screen { width: number; height: number; }
interface Viewport { width: number; height: number; }

class Media {
    extra = 0;
    plane: any;
    program: any;
    scale = 0;
    padding = 2;
    width = 0;
    widthTotal = 0;
    x = 0;
    private sized = false;
    private fadeStart = 0;

    /** true cat timp poza inca apare — tine bucla de randare pornita. */
    get animating(): boolean {
        return this.entry.loaded && this.program.uniforms.uAlpha.value < 1;
    }

    constructor(
        private gl: any,
        geometry: any,
        scene: any,
        private entry: TexEntry,
        public index: number,
        public length: number,
        private screen: Screen,
        private viewport: Viewport,
        private bend: number,
        private borderRadius: number
    ) {
        this.program = new Program(this.gl, {
            depthTest: false,
            depthWrite: false,
            vertex: VERTEX,
            fragment: FRAGMENT,
            uniforms: {
                // textura e partajata cu celelalte planuri ale aceleiasi poze
                tMap: { value: entry.texture },
                uPlaneSizes: { value: [0, 0] },
                uImageSizes: { value: [entry.width, entry.height] },
                uBorderRadius: { value: this.borderRadius },
                // 0 pana soseste textura, apoi urca la 1 in FADE_MS
                uAlpha: { value: 0 }
            },
            transparent: true
        });

        this.plane = new Mesh(this.gl, { geometry, program: this.program });
        this.plane.setParent(scene);
        this.onResize();
    }

    update(scroll: { current: number; last: number }, direction: 'left' | 'right') {
        // textura partajata s-a incarcat intre timp -> preia raportul ei
        if (this.entry.loaded && !this.sized) {
            this.program.uniforms.uImageSizes.value = [this.entry.width, this.entry.height];
            this.sized = true;
            this.fadeStart = performance.now();
        }

        if (this.sized && this.program.uniforms.uAlpha.value < 1) {
            const t = (performance.now() - this.fadeStart) / FADE_MS;
            this.program.uniforms.uAlpha.value = t >= 1 ? 1 : t;
        }

        // Bucla infinita: muta planul cu o lungime de banda pana intra in zona
        // utila. Se face INAINTE de desenare, nu dupa. Varianta originala ajusta
        // `extra` la finalul functiei, deci pozitia corecta aparea abia la
        // cadrul urmator — acceptabil la 60fps continuu, dar cu randare la
        // cerere acel cadru putea sa nu mai vina, si jumatate de roata ramanea
        // nedesenata pana miscai de ea.
        const planeOffset = this.plane.scale.x / 2;
        const viewportOffset = this.viewport.width / 2;

        let x = this.x - scroll.current - this.extra;

        if (this.widthTotal > 0) {
            let guard = 0;
            if (direction === 'right') {
                while (x + planeOffset < -viewportOffset && guard++ < MAX_WRAPS) {
                    this.extra -= this.widthTotal;
                    x = this.x - scroll.current - this.extra;
                }
            } else {
                while (x - planeOffset > viewportOffset && guard++ < MAX_WRAPS) {
                    this.extra += this.widthTotal;
                    x = this.x - scroll.current - this.extra;
                }
            }
        }

        this.plane.position.x = x;

        const H = this.viewport.width / 2;

        if (this.bend === 0) {
            this.plane.position.y = 0;
            this.plane.rotation.z = 0;
        } else {
            const B_abs = Math.abs(this.bend);
            const R = (H * H + B_abs * B_abs) / (2 * B_abs);
            const effectiveX = Math.min(Math.abs(x), H);
            const arc = R - Math.sqrt(R * R - effectiveX * effectiveX);

            if (this.bend > 0) {
                this.plane.position.y = -arc;
                this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
            } else {
                this.plane.position.y = arc;
                this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
            }
        }

    }

    onResize(sizes?: { screen: Screen; viewport: Viewport }) {
        if (sizes) {
            this.screen = sizes.screen;
            this.viewport = sizes.viewport;
        }
        this.scale = this.screen.height / 1500;
        this.plane.scale.y = (this.viewport.height * (900 * this.scale)) / this.screen.height;
        this.plane.scale.x = (this.viewport.width * (700 * this.scale)) / this.screen.width;
        this.plane.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
        this.width = this.plane.scale.x + this.padding;
        this.widthTotal = this.width * this.length;
        this.x = this.width * this.index;
    }

    destroy() {
        // Roata e refolosita intre sectiuni, deci contextul NU se pierde si
        // nimic nu se elibereaza singur. Textura e a TextureStore-ului, aici
        // eliberam doar programul.
        this.plane?.setParent(null);
        if (this.program?.program) this.gl.deleteProgram(this.program.program);
    }
}

export class CircularWheel {
    private renderer: any;
    private gl: any;
    private camera: any;
    private scene: any;
    private planeGeometry: any;
    private medias: Media[] = [];
    private store: TextureStore | null = null;
    private screen!: Screen;
    private viewport!: Viewport;
    private scroll = { ease: 0.05, current: 0, target: 0, last: 0, position: 0 };
    private raf = 0;
    private dirty = true;
    contextLost = false;
    private isDown = false;
    private start = 0;
    private startY = 0;
    private dragDistance = 0;
    private scrollSpeed: number;
    private bend: number;
    private borderRadius: number;
    private container: HTMLElement | null = null;
    private itemCount = 0;
    private onSelect?: (index: number) => void;
    private onCheckDebounce: () => void;

    private boundResize = () => this.onResize();
    private boundDown = (e: PointerEvent) => this.onPointerDown(e);
    private boundMove = (e: PointerEvent) => this.onPointerMove(e);
    private boundUp = (e: PointerEvent) => this.onPointerUp(e);
    private boundCancel = (e: PointerEvent) => this.onPointerCancel(e);
    private boundClick = (e: MouseEvent) => this.onClick(e);
    private boundContextLost = (e: Event) => {
        e.preventDefault();
        this.contextLost = true;
        const canvas = this.gl?.canvas;
        if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    };
    private boundKey = (e: KeyboardEvent) => this.onKeyDown(e);

    // Contextul WebGL se creeaza O SINGURA DATA, la construirea rotii.
    // Roata e apoi mutata intre sectiuni cu attach()/detach(), deci pe toata
    // pagina exista un numar fix de contexte, oricat de repede ai derula.
    constructor(opts: WheelDefaults = {}) {
        const { bend = 3, borderRadius = 0.05, scrollSpeed = 2, scrollEase = 0.05 } = opts;

        this.bend = bend;
        this.borderRadius = borderRadius;
        this.scrollSpeed = scrollSpeed;
        this.scroll.ease = scrollEase;
        this.onCheckDebounce = debounce(() => this.onCheck(), 200);

        this.renderer = new Renderer({
            alpha: true,
            // MSAA nu aduce nimic pe patrate texturate — marginile rotunjite sunt
            // deja netezite in fragment shader (smoothstep pe SDF)
            antialias: false,
            // dpr 2 inseamna de 4 ori mai multi pixeli de umplut
            dpr: Math.min(window.devicePixelRatio || 1, 1.5)
        });
        this.gl = this.renderer.gl;
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.canvas.addEventListener('webglcontextlost', this.boundContextLost);

        this.camera = new Camera(this.gl);
        this.camera.fov = 45;
        this.camera.position.z = 20;

        this.scene = new Transform();
        // 1x1 segmente — nu mai exista deplasare de vertecsi de redat
        this.planeGeometry = new Plane(this.gl);

        window.addEventListener('resize', this.boundResize);
        this.update();
    }

    get attached(): boolean {
        return this.container !== null;
    }

    /** Muta roata in sectiunea data si incarca pozele ei. */
    attach(container: HTMLElement, items: WheelItem[], onSelect?: (index: number) => void) {
        if (this.container) this.detach();

        this.container = container;
        this.onSelect = onSelect;
        this.itemCount = items.length;

        container.appendChild(this.gl.canvas);
        this.addEventListeners();

        this.scroll.current = this.scroll.target = this.scroll.last = this.scroll.position = 0;
        this.onResize();

        this.store = new TextureStore(this.gl, () => { this.dirty = true; });

        // Duplicare ADAPTIVA. Originalul facea mereu items.concat(items), deci
        // un folder de 20 de poze ajungea la 40 de planuri chiar daca banda era
        // deja de 4 ori mai lata decat ecranul. Repetam doar cat sa acoperim
        // continuu bucla (de doua ori latimea vizibila).
        const planeWidth =
            (this.viewport.width * (700 * (this.screen.height / 1500))) / this.screen.width;
        const itemWidth = planeWidth + 2; // 2 = padding-ul din Media
        const needed = Math.max(2, Math.ceil((this.viewport.width * 2) / Math.max(itemWidth, 0.001)));

        let loop = items.slice();
        while (loop.length < needed && items.length) loop = loop.concat(items);

        this.medias = loop.map((data, index) =>
            new Media(
                this.gl, this.planeGeometry, this.scene,
                this.store!.get(data.image),
                index, loop.length, this.screen, this.viewport,
                this.bend, this.borderRadius
            )
        );

        this.dirty = true;
    }

    /** Scoate panza din sectiunea curenta si elibereaza texturile folderului. */
    detach() {
        if (!this.container) return;

        this.removeEventListeners();
        if (this.gl.canvas.parentNode === this.container) {
            this.container.removeChild(this.gl.canvas);
        }

        this.medias.forEach(m => m.destroy());
        this.medias = [];
        this.store?.dispose();
        this.store = null;
        this.scene = new Transform();

        this.container = null;
        this.onSelect = undefined;
        this.itemCount = 0;
        this.isDown = false;
    }

    private onPointerDown(e: PointerEvent) {
        this.isDown = true;
        this.dragDistance = 0;
        this.scroll.position = this.scroll.current;
        this.start = e.clientX;
        this.startY = e.clientY;
        this.container?.setPointerCapture?.(e.pointerId);
    }

    private onPointerMove(e: PointerEvent) {
        if (!this.isDown) return;
        const dx = this.start - e.clientX;
        this.dragDistance = Math.max(this.dragDistance, Math.hypot(dx, this.startY - e.clientY));
        this.scroll.target = this.scroll.position + dx * (this.scrollSpeed * 0.025);
        this.dirty = true;
    }

    private onPointerUp(e: PointerEvent) {
        if (!this.isDown) return;
        this.isDown = false;
        try { this.container?.releasePointerCapture?.(e.pointerId); } catch { /* deja eliberat */ }

        // Selectia NU se face aici. Vizualizatorul asculta mouseup pe body ca
        // sa se inchida la click in afara, iar ordinea evenimentelor este
        // pointerup -> mouseup -> click. Daca deschideam pe pointerup, mouseup-ul
        // imediat urmator il inchidea la loc. Deschidem pe click (vezi onClick).
        if (this.dragDistance < 8) return;
        this.onCheck();
    }

    // Pe gesturi verticale browserul preia scroll-ul si trimite pointercancel.
    // Fara ramura asta separata, un simplu scroll pe telefon ar fi numarat ca
    // "drag de 0px" adica click, si ar fi deschis o poza.
    private onPointerCancel(e: PointerEvent) {
        if (!this.isDown) return;
        this.isDown = false;
        try { this.container?.releasePointerCapture?.(e.pointerId); } catch { /* deja eliberat */ }
    }

    private onClick(e: MouseEvent) {
        if (this.dragDistance >= 8 || !this.onSelect || !this.itemCount) return;
        const hit = this.mediaAt(e.clientX);
        if (hit === null) return;
        this.onSelect(((hit % this.itemCount) + this.itemCount) % this.itemCount);
    }

    // Care poza e sub cursor: ecran → coordonate lume, apoi cel mai apropiat
    // plan care chiar acopera punctul.
    private mediaAt(clientX: number): number | null {
        if (!this.container) return null;
        const rect = this.container.getBoundingClientRect();
        if (!rect.width) return null;

        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const worldX = ndcX * (this.viewport.width / 2);

        let best: number | null = null;
        let bestDist = Infinity;

        this.medias.forEach((m, i) => {
            const dist = Math.abs(m.plane.position.x - worldX);
            if (dist <= m.plane.scale.x / 2 && dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        });

        return best;
    }

    private onKeyDown(e: KeyboardEvent) {
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.scroll.target += this.scrollSpeed * 5;
            this.dirty = true;
            this.onCheckDebounce();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.scroll.target -= this.scrollSpeed * 5;
            this.dirty = true;
            this.onCheckDebounce();
        }
    }

    private onCheck() {
        if (!this.medias.length) return;
        const width = this.medias[0].width;
        const itemIndex = Math.round(Math.abs(this.scroll.target) / width);
        const item = width * itemIndex;
        this.scroll.target = this.scroll.target < 0 ? -item : item;
        this.dirty = true;
    }

    private onResize() {
        if (!this.container) return;

        this.screen = {
            width: this.container.clientWidth,
            height: this.container.clientHeight
        };
        this.renderer.setSize(this.screen.width, this.screen.height);
        this.camera.perspective({ aspect: this.screen.width / this.screen.height });

        const fov = (this.camera.fov * Math.PI) / 180;
        const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
        const width = height * this.camera.aspect;
        this.viewport = { width, height };

        this.medias.forEach(m => m.onResize({ screen: this.screen, viewport: this.viewport }));
        this.dirty = true;
    }

    // Randare la cerere: cand roata sta pe loc nu mai desenam nimic. Inainte
    // fiecare roata activa tinea GPU-ul ocupat la 60fps degeaba, in paralel cu
    // fundalul three.js.
    private update = () => {
        this.raf = window.requestAnimationFrame(this.update);

        if (this.contextLost || !this.container || !this.medias.length) return;

        // Bucla ramane pornita cat timp mai vin texturi SAU cat timp vreo poza
        // inca apare treptat.
        const loading = (this.store?.pending ?? 0) > 0
            || this.medias.some(m => m.animating);

        const moving = Math.abs(this.scroll.target - this.scroll.current) > 0.01;
        if (!moving && !this.dirty && !loading) return;

        if (moving) {
            this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
        } else {
            this.scroll.current = this.scroll.target;
            this.dirty = loading; // ne oprim abia dupa ce s-au incarcat toate
        }

        const direction = this.scroll.current > this.scroll.last ? 'right' : 'left';
        this.medias.forEach(m => m.update(this.scroll, direction));
        this.renderer.render({ scene: this.scene, camera: this.camera });
        this.scroll.last = this.scroll.current;
    };

    /** Cere un cadru nou (drag, tasta, textura tocmai incarcata, resize). */
    invalidate() {
        this.dirty = true;
    }

    private addEventListeners() {
        if (!this.container) return;
        // pe container, nu pe window — altfel toate rotile paginii ar reactiona
        // la acelasi drag
        this.container.addEventListener('pointerdown', this.boundDown);
        this.container.addEventListener('pointermove', this.boundMove);
        this.container.addEventListener('pointerup', this.boundUp);
        this.container.addEventListener('pointercancel', this.boundCancel);
        this.container.addEventListener('click', this.boundClick);
        this.container.addEventListener('keydown', this.boundKey);
    }

    private removeEventListeners() {
        if (!this.container) return;
        this.container.removeEventListener('pointerdown', this.boundDown);
        this.container.removeEventListener('pointermove', this.boundMove);
        this.container.removeEventListener('pointerup', this.boundUp);
        this.container.removeEventListener('pointercancel', this.boundCancel);
        this.container.removeEventListener('click', this.boundClick);
        this.container.removeEventListener('keydown', this.boundKey);
    }

    /** Distruge definitiv roata si contextul ei. Doar la parasirea paginii. */
    destroy() {
        window.cancelAnimationFrame(this.raf);
        window.removeEventListener('resize', this.boundResize);
        this.detach();

        const canvas = this.gl?.canvas;
        canvas?.removeEventListener('webglcontextlost', this.boundContextLost);
        const lose = this.gl?.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    }
}
