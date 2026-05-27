# Huella Digital — Módulo One-Shoot

> Estado al: 2026-05-27  
> Sprints completados: 1, 2, 3 (parcial)  
> Branch: main (commit post-merge de `claude/friendly-euler-TOPai`)

---

## ¿Qué hace el módulo?

Workflow de testing de creativos publicitarios en 2 pasos + 1 opcional:

1. **Paso 1 — Testing Angles (P1):** Genera ángulos de mensaje distintos (product vs category) + una imagen por ángulo. El usuario evalúa cuáles convierten mejor.
2. **Paso 2 — Escalada PEC (P2):** Para los ángulos ganadores, genera 3 creativos por ángulo (Prospección / Evaluación / Conversión) con formatos específicos.
3. **Paso 3 — Format Adaptation (P3, opcional):** Adapta creativos P2 a otros formatos (story 9:16, square 1:1, landscape 16:9, etc.).

---

## Archivos del módulo

| Archivo | Rol |
|---------|-----|
| `app/one-shoot/page.tsx` | Componente principal (~2300 líneas), toda la UI y lógica de cliente |
| `app/api/generate-testing-angles/route.ts` | SSE: genera ángulos + imágenes P1 |
| `app/api/generate-pec-creatives/route.ts` | SSE: genera creativos P/E/C por ángulo ganador |
| `app/api/one-shoot-sessions/route.ts` | GET (lista) + POST (crear sesión) |
| `app/api/one-shoot-sessions/[id]/route.ts` | GET + PATCH + DELETE de sesión individual |
| `app/api/adjust-image/route.ts` | Refinamiento puntual de imágenes (P2 refine) |
| `app/api/adapt-size/route.ts` | Adaptar imagen a otro formato/ratio |

---

## Tabla Supabase: `one_shoot_sessions`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid PK | Generado automático |
| `user_id` | uuid FK | → auth.users |
| `created_at` | timestamp | Creación |
| `updated_at` | timestamp | Último PATCH |
| `status` | text | `'paso1_done'` \| `'paso2_done'` |
| `brief` | text | Descripción del producto/oferta |
| `count` | integer | Cantidad de ángulos generados |
| `is_fashion_product` | boolean | Detectado automáticamente |
| `product_description` | text | Descripción técnica generada por GPT-4o |
| `person_description` | text | Descripción de persona de referencia |
| `angles` | jsonb | `MessageAngle[]` |
| `winning_angle_keys` | jsonb | `string[]` — IDs de ángulos ganadores |
| `pec_results` | jsonb | `Omit<PECCreative, 'base64'>[]` — metadatos sin imágenes |

**Importante:** Las imágenes (base64) NO se guardan en la tabla. Van al Storage.

---

## Supabase Storage: bucket `one-shoot-images`

```
one-shoot-images/
└── {userId}/
    └── {sessionId}/
        ├── p1_{angleKey}.jpg
        ├── p1_adapted_{angleKey}_{format}.jpg
        ├── p2_{creativeId}.jpg
        └── p3_adapted_{creativeId}_{format}.jpg
```

Upload con 3 reintentos y backoff exponencial (1s / 2s / 4s). Upsert: true.

---

## LocalStorage keys

```
one_shoot_images_{sessionId}          → { p1: AngleImage[], angleStatuses, launchDate }
one_shoot_p2_{sessionId}              → PECCreative[]
one_shoot_p1_adapted_{sessionId}      → P1AdaptedImage[]
one_shoot_p3_adapted_{sessionId}      → P3AdaptedImage[]
one_shoot_product_imgs_{sessionId}    → string[] (base64 de fotos del producto)
one_shoot_ref_imgs_{sessionId}        → string[] (base64 de fotos de referencia)
one_shoot_angle_metrics_{sessionId}   → Record<angleKey, { purchases, spend }>
one_shoot_product_img_{sessionId}     → string (legacy: single image)
```

Cuando hay QuotaExceededError, `freeUpStorageFor(currentId)` limpia sesiones ajenas.

---

## Tipos principales

```typescript
type OneShootView =
  | 'sessions' | 'setup'
  | 'p1-generating' | 'p1-live' | 'p1-review'
  | 'p2-generating' | 'p2-results' | 'p2-refine'
  | 'p3';

interface MessageAngle {
  key: string;         // 'angle-0', 'angle-1', ...
  name: string;
  angle?: string;      // Descripción estratégica
  hook: string;        // Máx 8 palabras
  emphasis: string;
  level?: 'product' | 'category';
}

interface AngleImage {
  id: string;          // UUID (crypto.randomUUID)
  base64: string;
  angleKey: string;
  angleName: string;
  hook: string;
  emphasis: string;
  level?: 'product' | 'category';
}

interface PECCreative {
  id: string;          // UUID (crypto.randomUUID)
  angleKey: string;
  angleName: string;
  hook: string;
  stage: 'P' | 'E' | 'C';
  stageLabel: string;
  formatName: string;
  headline: string;
  subline: string;
  base64: string;      // Solo en localStorage/Storage, NUNCA en DB
}

type P1AdaptedImage = { format: string; label: string; angleKey: string; base64: string };
type P3AdaptedImage = { format: string; label: string; creativeId: string; base64: string };
type AngleStatus = 'active' | 'winner' | 'off';
```

---

## SSE: flujo generate-testing-angles

**maxDuration:** 300s | **Timeout de silencio:** 90s sin chunks → abort

**Request:**
```json
{
  "brief": "...",
  "brandKit": BrandKit,
  "productImages": ["base64..."],
  "referenceImages": ["base64..."],
  "productCount": 3,
  "categoryCount": 1,
  "peopleMode": "none" | "real",
  "excludeAngles": MessageAngle[]
}
```

**Stream:**
```
data: { "angles": [...] }                    ← primero los ángulos
data: { "image": AngleImage }                ← una por ángulo (en paralelo)
data: { "angleError": "angle-0" }            ← si una imagen falla
data: { "done": true, "isFashionProduct": bool, "productDescription": "...", "personDescription": "..." }
```

**Modelos usados:**

| Paso | Modelo |
|------|--------|
| Clasificación fashion | `gpt-4o-mini` |
| Descripción producto y persona | `gpt-4o` |
| Generación de ángulos (JSON) | `gpt-4o` |
| Generación de imágenes | `gpt-image-2` vía Responses API o `images.edit` |

---

## SSE: flujo generate-pec-creatives

**maxDuration:** 480s | **Timeout de silencio:** 90s sin chunks → abort

**Request:**
```json
{
  "brief": "...",
  "productDescription": "...",
  "personDescription": "...",
  "isFashionProduct": false,
  "winningAngles": MessageAngle[],
  "brandKit": BrandKit,
  "productImages": ["base64..."],
  "referenceImages": ["base64..."]
}
```

**Stream:**
```
data: { "total": 9 }
data: { "creative": PECCreative }            ← uno a medida que se genera
data: { "creativeError": { angleKey, stage } }
data: { "angleError": "angle-0" }
data: { "done": true }
```

**Formatos PEC:**

| Stage | Formatos posibles |
|-------|------------------|
| P (Prospección) | Aspiracional · Fundador · Editorial |
| E (Evaluación) | Testimonial · Beneficios · How-to |
| C (Conversión) | Oferta/Precio (solo si hay oferta en brief) · Prueba Social · Garantía |

---

## BrandKit: qué se usa y qué no en One-Shoot

### ✅ Se usa en prompts de generación

| Campo | Cómo |
|-------|------|
| `name` | Identifica la marca |
| `primary1`, `primary2`, `primary3` | Colores de fondo y texto |
| `typography` | Tipografía de headlines |
| `styleDescription` | Detección fashion/health, contexto visual |
| `clientRequest` | Contexto adicional |
| `referencePiecesThumbnails` | Piezas anteriores como referencia de estilo visual |

### ❌ NO se usa en One-Shoot (pendiente implementar)

| Campo | Estado |
|-------|--------|
| `logoBase64` | **Guardado en DB, no pasado a generación** |
| `logoColorBase64` | Idem |
| `logoWhiteBase64` | Idem |
| `logoDarkBase64` | Idem |
| `secondary1/2/3` | Generalmente ignorados |
| `quickAdjustments` | No aplicados en one-shoot |

> **Nota importante:** Los logos se almacenan en el BrandKit pero **no se pasan como `input_image`** a ninguna llamada de OpenAI dentro del módulo one-shoot. Las imágenes generadas son creativos de testing puros, sin branding visual aplicado (no incluyen el logo de la marca). Esto es un gap conocido — ver sección de pendientes.

---

## Persistencia: resumen de la estrategia

```
                    ┌────────────────┐
                    │   Supabase DB  │
                    │ one_shoot_     │
                    │ sessions       │
                    │ (metadatos,    │
                    │ ángulos, PEC   │
                    │ sin base64)    │
                    └───────┬────────┘
                            │ cross-device
                    ┌───────▼────────┐
                    │ Supabase       │
                    │ Storage        │
                    │ (imágenes      │
                    │ p1/p2/p3)      │
                    └───────┬────────┘
                            │ fallback
                    ┌───────▼────────┐
                    │ localStorage   │
                    │ (caché rápida) │
                    └────────────────┘
```

**Orden de lectura al retomar sesión:**
1. localStorage (instantáneo)
2. Supabase Storage (fallback por imagen individual, no all-or-nothing)

**Save incremental en P2:** cada creativo se sube a Storage al momento de llegar por SSE, sin esperar al `done`.

---

## Protecciones implementadas

| Protección | Dónde |
|-----------|-------|
| AbortController + timeout 8min (P1: 5min) | `generateP1`, `generateP2` |
| Timeout por silencio 90s sin chunks | P1 SSE loop, P2 SSE loop |
| Cancel button durante generación | Vistas `p1-generating`, `p2-generating` |
| Anti-double-submit (`isSubmitting`) | `generateP1` |
| Post-unmount guard (`isMountedRef`) | `generateP1`, `generateP2` |
| Upload retry 3x con backoff (1s/2s/4s) | `uploadBase64()` |
| Fallback por imagen en resume | `resumeSession()` |
| QuotaExceeded: limpia otras sesiones | `freeUpStorageFor()` |
| Validación inputs en routes | Todos los API routes |
| RLS via anon key (no service role) | `one-shoot-sessions/` routes |
| Sanitización de errores internos | Routes no exponen errores de DB |

---

## Sprints completados

### Sprint 1 — Fixes de estado y consistencia
- `resetToSetup`: limpia todos los estados de brief/setup al crear sesión nueva
- `resumeSession`: resetea errores y campos de entrada antes de cargar sesión
- `GameHeader`: corregido cálculo de step1Done/step1Active
- Validación de inputs en `generate-testing-angles` y `generate-pec-creatives`
- `crypto.randomUUID()` reemplaza `Math.random().toString(36).slice(2)`
- `undoP2Refinement`: ahora sincroniza a Supabase Storage

### Sprint 2 — Seguridad, cancelación, doble-submit
- API routes: reemplazado service role key por `createServerClient` + RLS
- Botones "Cancelar generación" en P1 y P2
- `isSubmitting` guard en `generateP1`
- `isMountedRef` guard post-unmount
- Modal de confirmación antes de borrar sesión (con botones de descarga)
- P1 y P3 format adaptations: persist en localStorage + Supabase Storage
- Fix TypeScript: `Uint8Array<ArrayBufferLike>` → `bytes.buffer as ArrayBuffer` en `uploadBase64`
- Fix prerender: `supabase-browser.ts` con fallback para build sin env vars

### Sprint 3 (parcial) — Robustez SSE y persistencia incremental
- SSE reader P1 + P2: timeout de 90s por silencio entre chunks
- P2 save incremental: cada creativo se sube a Storage al llegar, no al `done`

---

## Pendientes (Sprint 3 deferred)

| Item | Riesgo | Descripción |
|------|--------|-------------|
| Stale closures en `generateP2` | Medio | Usar refs para `sessionId`/`userId` dentro del async |
| P1 session creada antes del stream | Medio | Crear sesión DB antes de iniciar SSE para no perder P1 si se corta |
| Prompt injection sanitization | Medio | Delimitar `brief` del usuario en prompts para prevenir injection |

---

## Pendientes por roadmap

| Item | Descripción |
|------|-------------|
| **Logo en imágenes** | Pasar `logoBase64` del BrandKit como `input_image` a OpenAI. Actualmente los logos **no aparecen** en las imágenes generadas — el modelo recibe solo colores y texto descriptivo. |
| Sprint 3 deferred | Ver tabla de arriba |

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16.2.6 App Router (webpack), TypeScript, Tailwind CSS |
| Backend | Next.js Route Handlers, Server-Sent Events (SSE) |
| AI: texto | OpenAI `gpt-4o`, `gpt-4o-mini` |
| AI: imágenes | OpenAI `gpt-image-2` vía Responses API + `images.edit` |
| Auth | Supabase Auth + `@supabase/ssr` con cookie-based client |
| DB | Supabase PostgreSQL (tabla `one_shoot_sessions`) |
| Storage | Supabase Storage (bucket `one-shoot-images`) |
| Caché | Browser localStorage |
