'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import { useRequireAuth } from '@/app/lib/use-auth';
import { BrandKit } from '@/app/types';
import Sidebar from '@/app/components/Sidebar';
import { MessageAngle } from '@/app/api/generate-testing-angles/route';
import { readAsImage, compressImage, downloadExact } from '@/app/lib/image-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type OneShootView =
  | 'sessions'
  | 'setup'
  | 'p1-generating'
  | 'p1-live'
  | 'p1-review'
  | 'p2-generating'
  | 'p2-results'
  | 'p2-refine'
  | 'p3';

type AngleStatus = 'active' | 'winner' | 'off';

interface AngleImage {
  id: string;
  base64: string;
  angleKey: string;
  angleName: string;
  hook: string;
  emphasis: string;
  level?: 'product' | 'category';
}

interface PECCreative {
  id: string;
  angleKey: string;
  angleName: string;
  hook: string;
  stage: 'P' | 'E' | 'C';
  stageLabel: string;
  formatName: string;
  headline: string;
  subline: string;
  base64: string;
}

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: 'paso1_done' | 'paso2_done';
  brief: string;
  count: number;
  is_fashion_product: boolean;
  product_description: string;
  person_description: string;
  angles: MessageAngle[];
  winning_angle_keys: string[];
  pec_results: Omit<PECCreative, 'base64'>[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadImage(base64: string, name: string) {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${base64}`;
  a.download = name;
  a.click();
}

const lsKey = (id: string) => `one_shoot_images_${id}`;
const lsP2Key = (id: string) => `one_shoot_p2_${id}`;
const lsP1AdaptedKey = (id: string) => `one_shoot_p1_adapted_${id}`;
const lsP3AdaptedKey = (id: string) => `one_shoot_p3_adapted_${id}`;

// Evict binary image data from OTHER sessions when localStorage is full.
// Small metadata keys (angle_metrics, product_imgs, ref_imgs, statuses within lsKey)
// are preserved — only the heavy base64 payloads are removed.
function freeUpStorageFor(currentId: string) {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isImageKey =
        key.startsWith('one_shoot_images_') ||
        key.startsWith('one_shoot_p2_') ||
        key.startsWith('one_shoot_p1_adapted_') ||
        key.startsWith('one_shoot_p3_adapted_');
      const isCurrentSession = key.includes(currentId);
      if (isImageKey && !isCurrentSession) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ok */ }
}

interface LsData {
  p1: AngleImage[];
  angleStatuses: Record<string, AngleStatus>;
  launchDate: string;
}

// P1 images and angle statuses — stored separately from P2 to avoid hitting the 5MB localStorage limit
function saveLsImages(
  id: string,
  p1: AngleImage[],
  angleStatuses: Record<string, AngleStatus> = {},
  launchDate = ''
) {
  const payload = JSON.stringify({ p1, angleStatuses, launchDate });
  try {
    localStorage.setItem(lsKey(id), payload);
  } catch {
    // Quota exceeded — evict other sessions' image blobs and retry once
    freeUpStorageFor(id);
    try { localStorage.setItem(lsKey(id), payload); } catch { /* still full */ }
  }
}

function loadLsImages(id: string): LsData {
  try {
    const raw = localStorage.getItem(lsKey(id));
    if (!raw) return { p1: [], angleStatuses: {}, launchDate: '' };
    const parsed = JSON.parse(raw);
    return {
      p1: parsed.p1 || [],
      // legacy: some sessions stored p2 here before the split — ignored now
      angleStatuses: parsed.angleStatuses || {},
      launchDate: parsed.launchDate || '',
    };
  } catch { return { p1: [], angleStatuses: {}, launchDate: '' }; }
}

// P2 creatives stored in a dedicated key to avoid competing with P1 images for storage space
function saveLsP2(id: string, p2: PECCreative[]) {
  const payload = JSON.stringify(p2);
  try {
    localStorage.setItem(lsP2Key(id), payload);
  } catch {
    freeUpStorageFor(id);
    try { localStorage.setItem(lsP2Key(id), payload); } catch { /* still full */ }
  }
}

function loadLsP2(id: string): PECCreative[] {
  try {
    const raw = localStorage.getItem(lsP2Key(id));
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch { return []; }
}

type P1AdaptedImage = { format: string; label: string; angleKey: string; base64: string };
type P3AdaptedImage = { format: string; label: string; creativeId: string; base64: string };

function saveLsP1Adapted(id: string, data: P1AdaptedImage[]) {
  const payload = JSON.stringify(data);
  try {
    localStorage.setItem(lsP1AdaptedKey(id), payload);
  } catch {
    freeUpStorageFor(id);
    try { localStorage.setItem(lsP1AdaptedKey(id), payload); } catch { /* still full */ }
  }
}

function loadLsP1Adapted(id: string): P1AdaptedImage[] {
  try {
    const raw = localStorage.getItem(lsP1AdaptedKey(id));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLsP3Adapted(id: string, data: P3AdaptedImage[]) {
  const payload = JSON.stringify(data);
  try {
    localStorage.setItem(lsP3AdaptedKey(id), payload);
  } catch {
    freeUpStorageFor(id);
    try { localStorage.setItem(lsP3AdaptedKey(id), payload); } catch { /* still full */ }
  }
}

function loadLsP3Adapted(id: string): P3AdaptedImage[] {
  try {
    const raw = localStorage.getItem(lsP3AdaptedKey(id));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

type AngleMetricsMap = Record<string, { purchases: string; spend: string }>;

function saveAngleMetrics(id: string, metrics: AngleMetricsMap) {
  try { localStorage.setItem(`one_shoot_angle_metrics_${id}`, JSON.stringify(metrics)); } catch { /* ok */ }
}

function loadAngleMetrics(id: string): AngleMetricsMap {
  try {
    const raw = localStorage.getItem(`one_shoot_angle_metrics_${id}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ─── Supabase Storage helpers ─────────────────────────────────────────────────

const STORAGE_BUCKET = 'one-shoot-images';

// Returns true if upload succeeded, false if all retries exhausted.
// Retries up to 3 times with 1s / 2s / 4s backoff so transient network
// errors don't silently lose images.
async function uploadBase64(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  path: string,
  base64: string
): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const binary = atob(b64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch { return false; }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, new Blob([bytes.buffer as ArrayBuffer], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: true });
      if (!error) return true;
    } catch { /* network error — retry */ }
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
  }
  return false;
}

async function downloadBase64(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  path: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (error || !data) return null;
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(data);
    });
  } catch { return null; }
}

// ─── Game Header Component ────────────────────────────────────────────────────

interface GameHeaderProps {
  view: OneShootView;
}

function GameHeader({ view }: GameHeaderProps) {
  const step1Done = ['p1-review', 'p2-generating', 'p2-results', 'p2-refine', 'p3'].includes(view);
  const step2Done = ['p2-results', 'p2-refine', 'p3'].includes(view);
  const step1Active = ['setup', 'p1-generating', 'p1-live', 'p1-review'].includes(view);
  const step2Active = ['p2-generating', 'p2-results'].includes(view);
  const step3Active = view === 'p3';

  type StepState = 'done' | 'active' | 'locked';

  const getStepClasses = (state: StepState) => {
    if (state === 'done') return 'bg-green-500 text-white';
    if (state === 'active') return 'bg-[#e42820] text-white ring-2 ring-[#e42820]/30';
    return 'bg-gray-200 text-gray-400';
  };

  const getLabelClasses = (state: StepState) => {
    if (state === 'done') return 'text-green-600 font-semibold';
    if (state === 'active') return 'text-[#e42820] font-bold';
    return 'text-gray-400 font-medium';
  };

  const step1State: StepState = step1Done ? 'done' : step1Active ? 'active' : 'locked';
  const step2State: StepState = step2Done ? 'done' : step2Active ? 'active' : 'locked';
  const step3State: StepState = step3Active ? 'active' : 'locked';

  const line1Done = step1Done;
  const line2Done = step2Done;

  return (
    <div className="flex items-center justify-center gap-0 mb-6 px-2">
      {/* Step 1 */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${getStepClasses(step1State)}`}>
          {step1State === 'done' ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : '1'}
        </div>
        <span className={`text-[10px] mt-1 uppercase tracking-wide ${getLabelClasses(step1State)}`}>TEST</span>
      </div>

      {/* Line 1 */}
      <div className={`h-0.5 w-12 sm:w-20 mx-1 mt-[-10px] transition-colors ${line1Done ? 'bg-green-400' : 'bg-gray-200'}`} />

      {/* Step 2 */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${getStepClasses(step2State)}`}>
          {step2State === 'done' ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : '2'}
        </div>
        <span className={`text-[10px] mt-1 uppercase tracking-wide ${getLabelClasses(step2State)}`}>PEC</span>
      </div>

      {/* Line 2 */}
      <div className={`h-0.5 w-12 sm:w-20 mx-1 mt-[-10px] transition-colors ${line2Done ? 'bg-green-400' : 'bg-gray-200'}`} />

      {/* Step 3 (optional) */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
          step3Active
            ? 'border-purple-400 bg-purple-50 text-purple-600 ring-2 ring-purple-400/30'
            : 'border-gray-200 bg-white text-gray-400'
        }`}>
          3
        </div>
        <span className={`text-[10px] mt-1 uppercase tracking-wide ${step3Active ? 'text-purple-600 font-bold' : 'text-gray-400 font-medium'}`}>
          FORMATOS*
        </span>
      </div>
    </div>
  );
}

// ─── Guidance logic ───────────────────────────────────────────────────────────

type GuidanceAction = 'regenerate' | null;

interface GuidanceResult {
  text: string;
  color: string;
  action: GuidanceAction;
  phase: 'waiting' | 'deciding' | 'winner' | 'dead';
}

function getGuidanceMessage(
  days: number,
  purchases: number,
  accountType: 'new' | 'established',
  totalSpend: number,
  targetCpa: string,
  angleCount: number,
  dailyBudget: number,
  totalAccountPurchases: number,
): GuidanceResult | null {
  if (isNaN(days)) return null;

  const dayThreshold = accountType === 'new' ? 15 : 7;
  const daysOk = days >= dayThreshold;
  const cpaNum = parseFloat(targetCpa.replace(/\./g, '').replace(',', '.'));
  const spendPerAngle = (!isNaN(totalSpend) && angleCount > 0) ? totalSpend / angleCount : NaN;
  // Tight budget = ≤$20/day → kill at 2x CPA. More budget → allow 3x.
  const killMultiplier = (!isNaN(dailyBudget) && dailyBudget > 0 && dailyBudget <= 20) ? 2 : 3;
  // New account = < 40 total purchases → needs more time even with high CPA
  const isNewAccount = accountType === 'new';

  if (!isNaN(spendPerAngle) && !isNaN(cpaNum) && cpaNum > 0 && purchases === 0 && spendPerAngle >= cpaNum * killMultiplier) {
    return {
      text: `Hay anuncios que gastaron ${killMultiplier}x el costo objetivo sin generar ninguna venta. Te recomendamos apagarlos y probar mensajes nuevos.`,
      color: 'text-red-700 bg-red-50 border-red-200',
      action: 'regenerate',
      phase: 'dead',
    };
  }

  if (purchases === 0 && daysOk) {
    return {
      text: `${days} días sin ninguna venta. Estos mensajes no están funcionando — probá ángulos nuevos.`,
      color: 'text-red-700 bg-red-50 border-red-200',
      action: 'regenerate',
      phase: 'dead',
    };
  }

  if (!daysOk && (isNaN(purchases) || purchases < 4)) {
    return {
      text: `Todavía es temprano. Dejá correr al menos ${dayThreshold} días antes de tomar decisiones.`,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      action: null,
      phase: 'waiting',
    };
  }

  if (isNewAccount && purchases >= 1 && purchases < 4 && !daysOk) {
    return {
      text: `Señales tempranas positivas. La cuenta todavía está aprendiendo — dale más tiempo antes de apagar nada.`,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
      action: null,
      phase: 'waiting',
    };
  }

  if (daysOk && purchases >= 4) {
    return {
      text: `Tenés datos suficientes para decidir. Marcá el ángulo ganador y escalalo.`,
      color: 'text-green-700 bg-green-50 border-green-200',
      action: null,
      phase: 'winner',
    };
  }

  if (daysOk && purchases > 0 && purchases < 4) {
    return {
      text: `${purchases} venta${purchases > 1 ? 's' : ''} hasta ahora. Seguí acumulando datos — todavía no es suficiente para decidir.`,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      action: null,
      phase: 'deciding',
    };
  }

  return null;
}

interface AngleRec {
  type: 'scale' | 'off' | 'warn' | 'wait' | 'regenerate';
  label: string;
  color: string;
  light: 'green' | 'yellow' | 'orange' | 'red' | 'gray';
  burnPct?: number;
}

function getAngleRec(
  purchases: number,
  spend: number,
  days: number,
  targetCpa: number,
  accountType: 'new' | 'established',
  hasData: boolean,
  dailyBudget: number,
  totalAccountPurchases: number,
): AngleRec | null {
  if (!hasData) return null;
  const dayThreshold = accountType === 'new' ? 15 : 7;
  const isNewAccount = accountType === 'new';
  const killMultiplier = (!isNaN(dailyBudget) && dailyBudget > 0 && dailyBudget <= 20) ? 2 : 3;
  const burnPct = (targetCpa > 0 && spend > 0) ? Math.round((spend / targetCpa) * 100) : undefined;

  // Green: profitable
  if (purchases > 0 && targetCpa > 0 && spend / purchases <= targetCpa) return {
    type: 'scale', light: 'green',
    label: `Rentable — CPA real $${(spend / purchases).toFixed(0)}. Escalalo.`,
    color: 'bg-green-50 text-green-700 border-green-200',
    burnPct,
  };

  // Green: enough data, enough time
  if (!isNaN(days) && days >= dayThreshold && purchases >= 4 && !(targetCpa > 0 && spend / purchases > targetCpa)) return {
    type: 'scale', light: 'green',
    label: `${purchases} ventas en ${days} días — listo para escalar.`,
    color: 'bg-green-50 text-green-700 border-green-200',
    burnPct,
  };

  // Red: CPA too high — hard cap at 3x even for new accounts
  if (targetCpa > 0 && purchases > 0 && spend / purchases > targetCpa * 3) return {
    type: 'off', light: 'red',
    label: `Costo por venta muy alto ($${(spend / purchases).toFixed(0)}). No es rentable — apagalo.`,
    color: 'bg-red-50 text-red-700 border-red-200',
    burnPct,
  };

  // Red: spent kill threshold without purchases
  if (targetCpa > 0 && spend >= targetCpa * killMultiplier && purchases === 0) return {
    type: 'off', light: 'red',
    label: `Gastaste ${killMultiplier}x el costo objetivo sin ninguna venta. Apagalo.`,
    color: 'bg-red-50 text-red-700 border-red-200',
    burnPct,
  };

  // Orange: approaching kill threshold (>70% burned, no purchases)
  if (targetCpa > 0 && spend >= targetCpa * 0.7 && spend < targetCpa * killMultiplier && purchases === 0) return {
    type: 'warn', light: 'orange',
    label: `Gastaste el ${burnPct}% del costo objetivo sin ventas. Vigilalo.`,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    burnPct,
  };

  // Yellow: new account with high CPA but has purchases → needs time
  if (isNewAccount && purchases > 0 && targetCpa > 0 && spend / purchases > targetCpa && spend / purchases <= targetCpa * 3) return {
    type: 'wait', light: 'yellow',
    label: `Cuenta en aprendizaje — CPA alto pero dentro del rango. Dale más tiempo.`,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    burnPct,
  };

  // Gray: no CPA reference, enough days, no purchases
  if (!isNaN(days) && days >= dayThreshold && purchases === 0) return {
    type: 'regenerate', light: 'red',
    label: `${days} días sin ventas — cambiá el mensaje.`,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    burnPct,
  };

  // Blue: has some purchases, accumulating
  if (purchases > 0 && purchases < 4) return {
    type: 'wait', light: 'yellow',
    label: `${purchases} venta${purchases > 1 ? 's' : ''} — acumulando datos.`,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    burnPct,
  };

  // Default waiting
  if (purchases === 0 && spend > 0) return {
    type: 'wait', light: 'gray',
    label: 'Recolectando datos — seguí esperando.',
    color: 'bg-gray-50 text-gray-600 border-gray-200',
    burnPct,
  };

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OneShootPage() {
  useRequireAuth();
  const supabase = createSupabaseBrowser();

  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [brandKitLoaded, setBrandKitLoaded] = useState(false);

  // View
  const [view, setView] = useState<OneShootView>('sessions');

  // Sessions list
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Active session
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Setup
  const [brief, setBrief] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [productCount, setProductCount] = useState(2);
  const [categoryCount, setCategoryCount] = useState(2);
  const [peopleMode, setPeopleMode] = useState<'none' | 'real'>('none');
  const productFileRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);

  // P1 generation
  const [p1Angles, setP1Angles] = useState<MessageAngle[]>([]);
  const [p1Images, setP1Images] = useState<AngleImage[]>([]);
  const [p1Done, setP1Done] = useState(0);
  const [p1Total, setP1Total] = useState(0);
  const [isFashionProduct, setIsFashionProduct] = useState(false);
  const [productDescription, setProductDescription] = useState('');
  const [personDescription, setPersonDescription] = useState('');
  const [p1Error, setP1Error] = useState('');
  const [p1Elapsed, setP1Elapsed] = useState(0);
  const p1TimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const p1AbortRef = useRef<AbortController | null>(null);
  const p2AbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // P1 review
  const [angleStatuses, setAngleStatuses] = useState<Record<string, AngleStatus>>({});
  const [angleMetrics, setAngleMetrics] = useState<AngleMetricsMap>({});
  const [accountType, setAccountType] = useState<'new' | 'established'>('new');
  const [targetCpa, setTargetCpa] = useState('');
  const [dailyBudget, setDailyBudget] = useState('');
  const [totalAccountPurchases, setTotalAccountPurchases] = useState('');
  const [launchDate, setLaunchDate] = useState('');
  const [excludeAngles, setExcludeAngles] = useState<MessageAngle[]>([]);

  // Winners
  const [winnerKeys, setWinnerKeys] = useState<string[]>([]);

  // P2 generation
  const [p2Creatives, setP2Creatives] = useState<PECCreative[]>([]);
  const [p2Done, setP2Done] = useState(0);
  const [p2Total, setP2Total] = useState(0);
  const [p2Error, setP2Error] = useState('');
  const [p2Elapsed, setP2Elapsed] = useState(0);
  const p2TimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // P2 refine
  const [p2RefineInputs, setP2RefineInputs] = useState<Record<string, string>>({});
  const [p2RefineHistories, setP2RefineHistories] = useState<Record<string, string[]>>({});
  const [p2RefineImageHistories, setP2RefineImageHistories] = useState<Record<string, string[]>>({});
  const [p2RefiningId, setP2RefiningId] = useState<string | null>(null);
  const [p2CardRefineOpen, setP2CardRefineOpen] = useState<Record<string, boolean>>({});

  // P1 format adaptation
  const [p1AdaptFormats, setP1AdaptFormats] = useState<string[]>([]);
  const [p1AdaptedImages, setP1AdaptedImages] = useState<P1AdaptedImage[]>([]);
  const [p1Adapting, setP1Adapting] = useState(false);
  const [p1AdaptProgress, setP1AdaptProgress] = useState<{ done: number; total: number } | null>(null);

  // P3 format adaptation
  const [p3AdaptFormats, setP3AdaptFormats] = useState<string[]>([]);
  const [p3AdaptSourceIds, setP3AdaptSourceIds] = useState<string[]>([]);
  const [p3AdaptedImages, setP3AdaptedImages] = useState<P3AdaptedImage[]>([]);
  const [p3Generating, setP3Generating] = useState(false);

  // Error handling
  const [error, setError] = useState('');
  const [syncWarning, setSyncWarning] = useState('');

  // Delete confirmation modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Prevent double-submit on generation
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserEmail(session.user.email || '');
      setUserId(session.user.id);
      fetch('/api/profile').then(async r => {
        if (!r.ok) { setHasApiKey(false); return; }
        const data = await r.json();
        setHasApiKey(!!data.openai_api_key);
      }).catch(() => setHasApiKey(false));
      fetch('/api/brand-kits').then(async r => {
        if (!r.ok) { setBrandKitLoaded(true); return; }
        const kit = await r.json();
        if (kit && !kit.error) setBrandKit(kit as BrandKit);
      }).catch(console.error).finally(() => setBrandKitLoaded(true));
    };
    load();
  }, [supabase]);

  // ── Load sessions ─────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/one-shoot-sessions');
      if (res.ok) setSessions(await res.json());
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Timers ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (view === 'p1-generating') {
      setP1Elapsed(0);
      p1TimerRef.current = setInterval(() => setP1Elapsed(s => s + 1), 1000);
    } else {
      if (p1TimerRef.current) { clearInterval(p1TimerRef.current); p1TimerRef.current = null; }
    }
    return () => { if (p1TimerRef.current) clearInterval(p1TimerRef.current); };
  }, [view]);

  useEffect(() => {
    if (view === 'p2-generating') {
      setP2Elapsed(0);
      p2TimerRef.current = setInterval(() => setP2Elapsed(s => s + 1), 1000);
    } else {
      if (p2TimerRef.current) { clearInterval(p2TimerRef.current); p2TimerRef.current = null; }
    }
    return () => { if (p2TimerRef.current) clearInterval(p2TimerRef.current); };
  }, [view]);

  // ── Unmount guard — prevents post-unmount state writes ───────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Keep winnerKeys synced with angleStatuses ─────────────────────────────
  useEffect(() => {
    const winners = Object.entries(angleStatuses)
      .filter(([, status]) => status === 'winner')
      .map(([key]) => key);
    setWinnerKeys(winners);
  }, [angleStatuses]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleProductFile = async (file: File) => {
    const b64 = await readAsImage(file);
    if (b64) setProductImages(prev => [...prev, b64].slice(0, 3));
  };

  const handleReferenceFile = async (file: File) => {
    const b64 = await readAsImage(file);
    if (b64) setReferenceImages(prev => [...prev, b64].slice(0, 2));
  };

  const scrapeProduct = async () => {
    if (!productUrl.trim()) return;
    setScrapingUrl(true);
    try {
      const res = await fetch('/api/scrape-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl }),
      });
      const data = await res.json();
      if (data.clientRequest) setBrief(data.clientRequest);
    } catch { /* keep existing brief */ }
    finally { setScrapingUrl(false); }
  };

  // ── P1 Generation ─────────────────────────────────────────────────────────
  const generateP1 = async () => {
    if (isSubmitting) return;
    if (!brandKit) { setError('Configurá tu marca en "Mi marca" antes de continuar.'); return; }
    if (!brief.trim()) { setError('Describí el producto antes de continuar.'); return; }
    setIsSubmitting(true);

    const total = productCount + categoryCount;
    setError('');
    setP1Angles([]);
    setP1Images([]);
    setP1Done(0);
    setP1Total(total);
    setP1Error('');
    setAngleStatuses({});
    setAngleMetrics({});
    setLaunchDate('');
    setView('p1-generating');

    const productImagesCompressed = await Promise.all(productImages.map(img => compressImage(img, 1024)));
    const refImagesCompressed = await Promise.all(
      referenceImages.map(img => compressImage(img, 768))
    );

    const controller = new AbortController();
    p1AbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
      const res = await fetch('/api/generate-testing-angles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          brief,
          brandKit,
          productImages: productImagesCompressed.slice(0, 2),
          referenceImages: refImagesCompressed,
          productCount,
          categoryCount,
          peopleMode,
          excludeAngles: excludeAngles.length > 0 ? excludeAngles : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        setP1Error('Error al conectar con el servidor.');
        setView('p1-live');
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      let finalAngles: MessageAngle[] = [];
      const finalImages: AngleImage[] = [];
      let finalIsFashion = false;
      let finalProdDesc = '';
      let finalPersonDesc = '';

      let chunkTimer: ReturnType<typeof setTimeout> | null = null;
      const resetChunkTimer = () => {
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => controller.abort(), 90_000);
      };
      resetChunkTimer();

      while (true) {
        const { done, value } = await reader.read();
        if (done) { if (chunkTimer) clearTimeout(chunkTimer); break; }
        resetChunkTimer();
        buffer += dec.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(part.slice(6));
            if (data.error) { setP1Error(data.error); }
            if (data.angles) {
              finalAngles = data.angles;
              setP1Angles(data.angles);
              setP1Total(data.angles.length);
            }
            if (data.image) {
              finalImages.push(data.image);
              setP1Images(prev => [...prev, data.image]);
              setP1Done(prev => prev + 1);
            }
            if (data.angleError) { setP1Done(prev => prev + 1); }
            if (data.done) {
              finalIsFashion = !!data.isFashionProduct;
              finalProdDesc = data.productDescription || '';
              finalPersonDesc = data.personDescription || '';
              setIsFashionProduct(finalIsFashion);
              setProductDescription(finalProdDesc);
              setPersonDescription(finalPersonDesc);
            }
          } catch { /* skip malformed */ }
        }
      }

      // Save session to Supabase (no images in DB)
      if (finalAngles.length > 0) {
        const saveRes = await fetch('/api/one-shoot-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'paso1_done',
            brief,
            count: finalAngles.length,
            isFashionProduct: finalIsFashion,
            productDescription: finalProdDesc,
            personDescription: finalPersonDesc,
            angles: finalAngles,
            winningAngleKeys: [],
            pecResults: [],
          }),
        });

        if (saveRes.ok) {
          const { id } = await saveRes.json();
          setSessionId(id);
          // Store images in localStorage (fast cache) and Supabase Storage (cross-device persistence)
          const generatedAt = new Date().toISOString();
          saveLsImages(id, finalImages, {}, generatedAt);
          // Await uploads so navigating away doesn't abort them mid-flight
          if (userId) {
            const uploadResults = await Promise.allSettled(
              finalImages.map(img =>
                uploadBase64(supabase, `${userId}/${id}/p1_${img.angleKey}.jpg`, img.base64)
              )
            );
            const failed = uploadResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;
            if (failed > 0) setSyncWarning(`${failed} imagen${failed > 1 ? 'es' : ''} no se pudo${failed > 1 ? 'ron' : ''} sincronizar con la nube. Están guardadas en este dispositivo.`);
          }
          // Also store product/ref images for P2 generation
          try {
            if (productImagesCompressed.length > 0) {
              localStorage.setItem(`one_shoot_product_imgs_${id}`, JSON.stringify(productImagesCompressed));
            }
            if (refImagesCompressed.length > 0) {
              localStorage.setItem(`one_shoot_ref_imgs_${id}`, JSON.stringify(refImagesCompressed));
            }
          } catch { /* storage full */ }
          await loadSessions();
        }
      }

      setView('p1-live');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setP1Error(p1Images.length > 0 ? '' : 'La generación fue cancelada o tardó demasiado.');
      } else {
        setP1Error('Error inesperado. Intentá de nuevo.');
      }
      if (isMountedRef.current) setView('p1-live');
    } finally {
      clearTimeout(timeout);
      p1AbortRef.current = null;
      setIsSubmitting(false);
    }
  };

  // ── Resume session ────────────────────────────────────────────────────────
  const resumeSession = async (session: SessionRow) => {
    // Reset per-session transient state before loading the new session
    setSyncWarning('');
    setP2Error('');
    setTargetCpa('');
    setDailyBudget('');
    setAccountType('new');
    setTotalAccountPurchases('');
    setLaunchDate('');
    setExcludeAngles([]);
    setP2CardRefineOpen({});
    setP2RefineHistories({});
    setP2RefineImageHistories({});

    setSessionId(session.id);
    setBrief(session.brief);
    setIsFashionProduct(session.is_fashion_product);
    setProductDescription(session.product_description || '');
    setPersonDescription(session.person_description || '');
    setP1Angles(session.angles);
    setWinnerKeys(session.winning_angle_keys || []);

    const stored = loadLsImages(session.id);
    let p1ToLoad = stored.p1;

    // Per-image Supabase fallback — recover any angle missing from localStorage individually
    if (userId && session.angles.length > 0) {
      const loadedKeys = new Set(p1ToLoad.map(img => img.angleKey));
      const missing = session.angles.filter(a => !loadedKeys.has(a.key));
      if (missing.length > 0) {
        const recovered = (await Promise.all(
          missing.map(async (angle) => {
            const b64 = await downloadBase64(supabase, `${userId}/${session.id}/p1_${angle.key}.jpg`);
            if (!b64) return null;
            return { id: angle.key, base64: b64, angleKey: angle.key, angleName: angle.name, hook: angle.hook, emphasis: angle.emphasis, level: angle.level } as AngleImage;
          })
        )).filter(Boolean) as AngleImage[];
        if (recovered.length > 0) {
          p1ToLoad = [...p1ToLoad, ...recovered];
          saveLsImages(session.id, p1ToLoad, stored.angleStatuses, stored.launchDate);
        }
      }
    }

    setP1Images(p1ToLoad);
    setAngleStatuses(stored.angleStatuses || {});
    setAngleMetrics(loadAngleMetrics(session.id));
    if (stored.launchDate) setLaunchDate(stored.launchDate);

    // Restore product images from localStorage
    try {
      const prodImgs = localStorage.getItem(`one_shoot_product_imgs_${session.id}`);
      if (prodImgs) setProductImages(JSON.parse(prodImgs));
      else {
        const legacy = localStorage.getItem(`one_shoot_product_img_${session.id}`);
        if (legacy) setProductImages([legacy]);
      }
      const refImgs = localStorage.getItem(`one_shoot_ref_imgs_${session.id}`);
      if (refImgs) setReferenceImages(JSON.parse(refImgs));
    } catch { /* ok */ }

    let storedP2 = loadLsP2(session.id);

    // Per-creative Supabase fallback — recover any creative missing from localStorage individually
    if (session.status === 'paso2_done' && userId && session.pec_results?.length > 0) {
      const loadedIds = new Set(storedP2.map(c => c.id));
      const missingMeta = session.pec_results.filter(meta => !loadedIds.has(meta.id));
      if (missingMeta.length > 0) {
        const recovered = (await Promise.all(
          missingMeta.map(async (meta) => {
            const b64 = await downloadBase64(supabase, `${userId}/${session.id}/p2_${meta.id}.jpg`);
            if (!b64) return null;
            return { ...meta, base64: b64 } as PECCreative;
          })
        )).filter(Boolean) as PECCreative[];
        if (recovered.length > 0) {
          storedP2 = [...storedP2, ...recovered];
          saveLsP2(session.id, storedP2);
        }
      }
    }

    // Restore P1 format adaptations
    const storedP1Adapted = loadLsP1Adapted(session.id);
    if (storedP1Adapted.length > 0) {
      setP1AdaptedImages(storedP1Adapted);
    } else if (userId) {
      // Try Supabase fallback for adapted images
      try {
        const { data: files } = await supabase.storage.from(STORAGE_BUCKET).list(`${userId}/${session.id}`);
        const adaptedFiles = files?.filter(f => f.name.startsWith('p1_adapted_')) || [];
        if (adaptedFiles.length > 0) {
          const FORMAT_LABELS: Record<string, string> = { story: 'Story / Reels (9:16)', square: 'Cuadrado 1:1' };
          const recovered = (await Promise.all(
            adaptedFiles.map(async f => {
              // filename: p1_adapted_{angleKey}_{format}.jpg
              const match = f.name.match(/^p1_adapted_(.+)_(story|square)\.jpg$/);
              if (!match) return null;
              const [, angleKey, format] = match;
              const b64 = await downloadBase64(supabase, `${userId}/${session.id}/${f.name}`);
              if (!b64) return null;
              return { format, label: FORMAT_LABELS[format] || format, angleKey, base64: b64 } as P1AdaptedImage;
            })
          )).filter(Boolean) as P1AdaptedImage[];
          if (recovered.length > 0) {
            setP1AdaptedImages(recovered);
            saveLsP1Adapted(session.id, recovered);
          }
        }
      } catch { /* ok */ }
    }

    // Restore P3 format adaptations (only meaningful when session is paso2_done)
    if (session.status === 'paso2_done') {
      const storedP3Adapted = loadLsP3Adapted(session.id);
      if (storedP3Adapted.length > 0) {
        setP3AdaptedImages(storedP3Adapted);
      } else if (userId) {
        try {
          const { data: files } = await supabase.storage.from(STORAGE_BUCKET).list(`${userId}/${session.id}`);
          const adaptedFiles = files?.filter(f => f.name.startsWith('p3_adapted_')) || [];
          if (adaptedFiles.length > 0) {
            const FORMAT_LABELS: Record<string, string> = {
              story: 'Story / Reels', instant_exp: 'Exp. Instantánea', square: 'Cuadrado 1:1', landscape: 'Landscape 16:9',
            };
            const recovered = (await Promise.all(
              adaptedFiles.map(async f => {
                // filename: p3_adapted_{creativeId}_{format}.jpg
                const match = f.name.match(/^p3_adapted_(.+)_(story|instant_exp|square|landscape)\.jpg$/);
                if (!match) return null;
                const [, creativeId, format] = match;
                const b64 = await downloadBase64(supabase, `${userId}/${session.id}/${f.name}`);
                if (!b64) return null;
                return { format, label: FORMAT_LABELS[format] || format, creativeId, base64: b64 } as P3AdaptedImage;
              })
            )).filter(Boolean) as P3AdaptedImage[];
            if (recovered.length > 0) {
              setP3AdaptedImages(recovered);
              saveLsP3Adapted(session.id, recovered);
            }
          }
        } catch { /* ok */ }
      }
    }

    if (session.status === 'paso2_done' && storedP2.length > 0) {
      setP2Creatives(storedP2);
      const wk = Object.entries(stored.angleStatuses || {})
        .filter(([, s]) => s === 'winner')
        .map(([k]) => k);
      if (wk.length > 0) setWinnerKeys(wk);
      else setWinnerKeys(session.winning_angle_keys || []);
      setView('p2-results');
    } else {
      setView('p1-review');
    }
  };

  // ── P2 Generation ─────────────────────────────────────────────────────────
  const generateP2 = async () => {
    if (winnerKeys.length === 0) return;
    if (!brandKit) { setP2Error('Configurá tu marca en "Mi marca" antes de continuar.'); return; }

    const winners = p1Angles.filter(a => winnerKeys.includes(a.key));
    const totalCreatives = winners.length * 3;

    setP2Creatives([]);
    setP2Done(0);
    setP2Total(totalCreatives);
    setP2Error('');
    setView('p2-generating');

    // Save winner selection to Supabase
    if (sessionId) {
      await fetch(`/api/one-shoot-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winningAngleKeys: winnerKeys }),
      });
    }

    // Load product images from localStorage
    let prodImgs = productImages;
    let refImgs = referenceImages;

    if (prodImgs.length === 0 && sessionId) {
      try {
        const stored = localStorage.getItem(`one_shoot_product_imgs_${sessionId}`);
        if (stored) prodImgs = JSON.parse(stored);
        // legacy single-image key
        else {
          const storedSingle = localStorage.getItem(`one_shoot_product_img_${sessionId}`);
          if (storedSingle) prodImgs = [storedSingle];
        }
        const storedRef = localStorage.getItem(`one_shoot_ref_imgs_${sessionId}`);
        if (storedRef) refImgs = JSON.parse(storedRef);
      } catch { /* ok */ }
    }

    const prodImgsCompressed = await Promise.all(prodImgs.map(img => compressImage(img, 1024)));
    const refImagesCompressed = await Promise.all(refImgs.map(img => compressImage(img, 768)));

    const controller = new AbortController();
    p2AbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8 * 60 * 1000);

    try {
      const res = await fetch('/api/generate-pec-creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          brief,
          productDescription,
          personDescription,
          isFashionProduct,
          winningAngles: winners,
          brandKit,
          productImageBase64: prodImgsCompressed[0] || '',
          productImages: prodImgsCompressed.slice(0, 2),
          referenceImages: refImagesCompressed,
        }),
      });

      if (!res.ok || !res.body) {
        setP2Error('Error al conectar con el servidor.');
        setView('p2-results');
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';
      const collectedCreatives: PECCreative[] = [];
      const capturedUserId = userId;
      const capturedSessionId = sessionId;
      const capturedP1Images = p1Images;
      const capturedAngleStatuses = angleStatuses;
      const capturedLaunchDate = launchDate;
      const uploadPromises: Promise<boolean>[] = [];

      let chunkTimer: ReturnType<typeof setTimeout> | null = null;
      const resetChunkTimer = () => {
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => controller.abort(), 90_000);
      };
      resetChunkTimer();

      while (true) {
        const { done, value } = await reader.read();
        if (done) { if (chunkTimer) clearTimeout(chunkTimer); break; }
        resetChunkTimer();
        buffer += dec.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(part.slice(6));
            if (data.error) { setP2Error(data.error); }
            if (data.creative) {
              collectedCreatives.push(data.creative);
              setP2Creatives(prev => [...prev, data.creative]);
              setP2Done(prev => prev + 1);
              if (capturedUserId && capturedSessionId) {
                uploadPromises.push(uploadBase64(supabase, `${capturedUserId}/${capturedSessionId}/p2_${data.creative.id}.jpg`, data.creative.base64));
              }
            }
            if (data.creativeError) { setP2Done(prev => prev + 1); }
            if (data.angleError) { setP2Done(prev => prev + 3); } // whole angle plan failed — skip 3 slots
            if (data.done) {
              if (capturedSessionId) {
                const pecMeta = collectedCreatives.map(c => ({
                  id: c.id,
                  angleKey: c.angleKey,
                  angleName: c.angleName,
                  hook: c.hook,
                  stage: c.stage,
                  stageLabel: c.stageLabel,
                  formatName: c.formatName,
                  headline: c.headline,
                  subline: c.subline,
                }));
                await fetch(`/api/one-shoot-sessions/${capturedSessionId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'paso2_done', pecResults: pecMeta }),
                });
                saveLsImages(capturedSessionId, capturedP1Images, capturedAngleStatuses, capturedLaunchDate);
                saveLsP2(capturedSessionId, collectedCreatives);
                if (capturedUserId && capturedSessionId && uploadPromises.length > 0) {
                  const uploadResults = await Promise.allSettled(uploadPromises);
                  const failed = uploadResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;
                  if (failed > 0) setSyncWarning(`${failed} creativo${failed > 1 ? 's' : ''} no se pudo${failed > 1 ? 'ron' : ''} sincronizar con la nube. Están guardados en este dispositivo.`);
                }
                await loadSessions();
              }
            }
          } catch { /* skip malformed */ }
        }
      }

      if (isMountedRef.current) setView('p2-results');
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setP2Error(p2Creatives.length > 0 ? '' : 'La generación fue cancelada o tardó demasiado.');
      } else {
        setP2Error('Error inesperado. Intentá de nuevo.');
      }
      if (isMountedRef.current) setView('p2-results');
    } finally {
      clearTimeout(timeout);
      p2AbortRef.current = null;
    }
  };

  // ── P2 Refine ─────────────────────────────────────────────────────────────
  const applyP2Refinement = async (creativeId: string) => {
    const input = p2RefineInputs[creativeId]?.trim();
    if (!input) return;
    const creative = p2Creatives.find(c => c.id === creativeId);
    if (!creative) return;
    setP2RefiningId(creativeId);
    setP2RefineInputs(prev => ({ ...prev, [creativeId]: '' }));
    try {
      const prodImgsCompressed = await Promise.all(productImages.slice(0, 3).map(img => compressImage(img, 1024)));
      const res = await fetch('/api/adjust-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: creative.base64,
          instruction: input,
          productDetailImages: prodImgsCompressed.filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { base64, error: apiError } = await res.json();
      if (apiError) throw new Error(apiError);
      setP2RefineImageHistories(prev => ({ ...prev, [creativeId]: [...(prev[creativeId] || []), creative.base64] }));
      setP2RefineHistories(prev => ({ ...prev, [creativeId]: [...(prev[creativeId] || []), input] }));
      const updated = p2Creatives.map(c => c.id === creativeId ? { ...c, base64 } : c);
      setP2Creatives(updated);
      if (sessionId) saveLsP2(sessionId, updated);
      if (userId && sessionId) await uploadBase64(supabase, `${userId}/${sessionId}/p2_${creativeId}.jpg`, base64);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error aplicando ajuste');
    } finally {
      setP2RefiningId(null);
    }
  };

  const undoP2Refinement = async (creativeId: string) => {
    const imgHistory = p2RefineImageHistories[creativeId];
    if (!imgHistory?.length) return;
    const prev = imgHistory[imgHistory.length - 1];
    setP2RefineImageHistories(h => ({ ...h, [creativeId]: h[creativeId].slice(0, -1) }));
    setP2RefineHistories(h => ({ ...h, [creativeId]: (h[creativeId] || []).slice(0, -1) }));
    const updated = p2Creatives.map(c => c.id === creativeId ? { ...c, base64: prev } : c);
    setP2Creatives(updated);
    if (sessionId) saveLsP2(sessionId, updated);
    if (userId && sessionId) await uploadBase64(supabase, `${userId}/${sessionId}/p2_${creativeId}.jpg`, prev);
  };

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/one-shoot-sessions/${id}`, { method: 'DELETE' });
    try {
      localStorage.removeItem(lsKey(id));
      localStorage.removeItem(lsP2Key(id));
      localStorage.removeItem(lsP1AdaptedKey(id));
      localStorage.removeItem(lsP3AdaptedKey(id));
      localStorage.removeItem(`one_shoot_product_imgs_${id}`);
      localStorage.removeItem(`one_shoot_product_img_${id}`);
      localStorage.removeItem(`one_shoot_ref_imgs_${id}`);
      localStorage.removeItem(`one_shoot_angle_metrics_${id}`);
    } catch { /* ok */ }
    // Delete images from Supabase Storage
    if (userId) {
      try {
        const { data: files } = await supabase.storage.from(STORAGE_BUCKET).list(`${userId}/${id}`);
        if (files && files.length > 0) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove(files.map(f => `${userId}/${id}/${f.name}`));
        }
      } catch { /* ok */ }
    }
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const resetToSetup = (keepBrief = false) => {
    if (!keepBrief) setBrief('');
    setProductImages([]);
    setReferenceImages([]);
    setProductCount(2);
    setCategoryCount(2);
    setPeopleMode('none');
    setP1Angles([]);
    setP1Images([]);
    setP1Done(0);
    setP1Total(0);
    setP2Done(0);
    setP2Total(0);
    setAngleStatuses({});
    setAngleMetrics({});
    setLaunchDate('');
    setWinnerKeys([]);
    setP2Creatives([]);
    setP1AdaptedImages([]);
    setP3AdaptedImages([]);
    setP1AdaptFormats([]);
    setP3AdaptFormats([]);
    setP3AdaptSourceIds([]);
    setSessionId(null);
    setIsFashionProduct(false);
    setProductDescription('');
    setPersonDescription('');
    setProductImages([]);
    setProductUrl('');
    setP1Error('');
    setP2Error('');
    setError('');
    setSyncWarning('');
    setTargetCpa('');
    setDailyBudget('');
    setAccountType('new');
    setTotalAccountPurchases('');
    setP2CardRefineOpen({});
    setP2RefineHistories({});
    setP2RefineImageHistories({});
    setView('setup');
  };

  // ── P1 Format Adaptation ─────────────────────────────────────────────────
  const generateP1Adaptations = async () => {
    if (p1AdaptFormats.length === 0 || p1Images.length === 0) return;
    setP1Adapting(true);
    setP1AdaptProgress({ done: 0, total: p1Images.length });
    const FORMAT_LABELS: Record<string, string> = {
      story: 'Story / Reels (9:16)', square: 'Cuadrado 1:1',
    };
    const allResults: P1AdaptedImage[] = [];
    try {
      for (let i = 0; i < p1Images.length; i++) {
        const img = p1Images[i];
        setP1AdaptProgress({ done: i, total: p1Images.length });
        const results = await Promise.all(
          p1AdaptFormats.map(async format => {
            for (let attempt = 0; attempt < 2; attempt++) {
              const res = await fetch('/api/adapt-size', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: img.base64, format }),
              });
              if (res.ok) {
                const data = await res.json();
                return { format, label: FORMAT_LABELS[format] || format, angleKey: img.angleKey, base64: data.base64 } as P1AdaptedImage;
              }
              if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
            }
            return null;
          })
        );
        allResults.push(...(results.filter(Boolean) as P1AdaptedImage[]));
      }
      setP1AdaptedImages(allResults);
      if (sessionId) {
        saveLsP1Adapted(sessionId, allResults);
        if (userId) {
          await Promise.allSettled(
            allResults.map(a =>
              uploadBase64(supabase, `${userId}/${sessionId}/p1_adapted_${a.angleKey}_${a.format}.jpg`, a.base64)
            )
          );
        }
      }
    } finally {
      setP1Adapting(false);
      setP1AdaptProgress(null);
    }
  };

  // ── P3 Format Adaptation ─────────────────────────────────────────────────
  const generateP3Adaptations = async () => {
    const creativesToAdapt = p2Creatives.filter(c => p3AdaptSourceIds.includes(c.id));
    if (p3AdaptFormats.length === 0 || creativesToAdapt.length === 0) return;
    setP3Generating(true);
    const FORMAT_LABELS: Record<string, string> = {
      story: 'Story / Reels', instant_exp: 'Exp. Instantánea', square: 'Cuadrado 1:1', landscape: 'Landscape 16:9',
    };
    const allResults: P3AdaptedImage[] = [];
    try {
      for (const creative of creativesToAdapt) {
        const results = await Promise.all(
          p3AdaptFormats.map(async format => {
            for (let attempt = 0; attempt < 2; attempt++) {
              const res = await fetch('/api/adapt-size', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: creative.base64, format }),
              });
              if (res.ok) {
                const data = await res.json();
                return { format, label: FORMAT_LABELS[format] || format, creativeId: creative.id, base64: data.base64 } as P3AdaptedImage;
              }
              if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
            }
            return null;
          })
        );
        allResults.push(...(results.filter(Boolean) as P3AdaptedImage[]));
      }
      setP3AdaptedImages(allResults);
      if (sessionId) {
        saveLsP3Adapted(sessionId, allResults);
        if (userId) {
          await Promise.allSettled(
            allResults.map(a =>
              uploadBase64(supabase, `${userId}/${sessionId}/p3_adapted_${a.creativeId}_${a.format}.jpg`, a.base64)
            )
          );
        }
      }
    } finally {
      setP3Generating(false);
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────────────

  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const STAGE_COLORS: Record<string, string> = {
    P: 'bg-purple-50 border-purple-200 text-purple-700',
    E: 'bg-blue-50 border-blue-200 text-blue-700',
    C: 'bg-green-50 border-green-200 text-green-700',
  };

  const STAGE_BG: Record<string, string> = {
    P: 'bg-purple-600',
    E: 'bg-blue-600',
    C: 'bg-green-600',
  };

  // ─── Views ────────────────────────────────────────────────────────────────

  // ── Sessions list ─────────────────────────────────────────────────────────
  if (view === 'sessions') {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-widest text-[#e42820]">AD FORMULA</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Spicy Ad Formula</h1>
              <p className="text-gray-500 text-sm mt-1">Paso 1: testeá ángulos de mensaje → Paso 2: escalá el ganador en campaña PEC</p>
            </div>

            {/* No API key warning */}
            {hasApiKey === false && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                Necesitás configurar tu API key de OpenAI en{' '}
                <a href="/perfil" className="underline font-medium">Perfil</a> para usar este módulo.
              </div>
            )}

            {/* New session button — blocked if there's an active session */}
            {!loadingSessions && sessions.length > 0 ? (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Tenés un proyecto activo</p>
                  <p className="text-xs text-amber-700 mt-0.5">Cerrá el proyecto actual antes de iniciar uno nuevo. Así las imágenes se limpian y no acumulás sesiones abiertas.</p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => resetToSetup(false)}
                className="w-full mb-6 flex items-center justify-center gap-2 bg-[#e42820] text-white font-semibold py-3 rounded-xl hover:bg-[#c82019] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nueva sesión
              </button>
            )}

            {/* Sessions list */}
            {loadingSessions ? (
              <div className="text-center py-12 text-gray-400 text-sm">Cargando sesiones...</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium">Ninguna sesión todavía</p>
                <p className="text-gray-400 text-sm mt-1">Creá tu primera sesión para empezar a testear</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => resumeSession(session)}
                    className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            session.status === 'paso2_done'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {session.status === 'paso2_done' ? 'Paso 2 listo' : 'Paso 1 listo'}
                          </span>
                          {session.is_fashion_product && (
                            <span className="text-[10px] font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Fashion</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">{session.brief || 'Sin descripción'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {session.angles?.length || 0} ángulos · {new Date(session.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    {/* Close project button */}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirmId(session.id); }}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cerrar proyecto
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Delete confirmation modal */}
        {deleteConfirmId && (() => {
          const session = sessions.find(s => s.id === deleteConfirmId);
          const sessionImages = session ? (() => {
            try { return JSON.parse(localStorage.getItem(lsKey(session.id)) || '{}')?.p1 || []; } catch { return []; }
          })() as AngleImage[] : [];
          const p2Images = session ? loadLsP2(session.id) : [];
          const hasImages = sessionImages.length > 0 || p2Images.length > 0;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 text-base mb-1">¿Cerrar este proyecto?</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Se borrarán <span className="font-semibold text-gray-700">todas las imágenes</span> guardadas en la nube de forma permanente. Esta acción no se puede deshacer.
                </p>
                {hasImages && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
                    <p className="font-semibold mb-1">Asegurate de descargar antes de cerrar.</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {sessionImages.length > 0 && (
                        <button
                          onClick={() => sessionImages.forEach((img: AngleImage) => downloadImage(img.base64, `angulo-${img.angleKey}.png`))}
                          className="flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Ángulos P1 ({sessionImages.length})
                        </button>
                      )}
                      {p2Images.length > 0 && (
                        <button
                          onClick={() => p2Images.forEach((c: PECCreative) => downloadImage(c.base64, `escalada-${c.id}.png`))}
                          className="flex items-center gap-1 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Creativos PEC ({p2Images.length})
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async e => {
                      const id = deleteConfirmId;
                      setDeleteConfirmId(null);
                      await deleteSession(id, e as unknown as React.MouseEvent);
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
                  >
                    Sí, cerrar y borrar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (view === 'setup') {
    const totalAngles = productCount + categoryCount;
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-xl mx-auto px-4 py-8">
            <button
              onClick={() => setView('sessions')}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Mis sesiones
            </button>

            <GameHeader view={view} />

            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">¿Qué querés testear?</h1>
              <p className="text-sm text-gray-500 mt-1">Una sesión = un producto o categoría. Encontrá el mensaje que convierte.</p>
            </div>

            {excludeAngles.length > 0 && (
              <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Se van a generar ángulos distintos a los {excludeAngles.length} que ya probaste y no convirtieron.{' '}
                  <button onClick={() => setExcludeAngles([])} className="underline font-medium">Cancelar exclusión</button>
                </span>
              </div>
            )}

            {brandKitLoaded && !brandKit && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                No encontramos tu marca.{' '}
                <a href="/config" className="underline font-medium">Configurala primero</a> para que los creativos reflejen tu identidad.
              </div>
            )}

            {error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {/* URL scraper */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                URL del producto <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={productUrl}
                  onChange={e => setProductUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && scrapeProduct()}
                  placeholder="https://tutienda.com/producto"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                />
                <button
                  onClick={scrapeProduct}
                  disabled={!productUrl.trim() || scrapingUrl}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                >
                  {scrapingUrl ? 'Analizando...' : 'Importar brief'}
                </button>
              </div>
            </div>

            {/* Brief */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Describí el producto, la categoría o la oferta <span className="text-red-500">*</span>
              </label>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Ej: Remera oversize de algodón orgánico, colores tierra, para mujer urbana 25-35 años. Diferencial: tela suave al tacto y corte favorecedor."
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820] resize-none"
              />
            </div>

            {/* Product images */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Fotos del producto <span className="text-gray-400 font-normal">(opcional · hasta 3)</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">Para ropa: subí frente, espalda y detalle del estampado para mejor fidelidad.</p>
              <div className="flex gap-2 flex-wrap">
                {productImages.map((img, i) => (
                  <div key={i} className="relative w-20 h-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`}
                      alt={`Producto ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-xl border border-gray-200"
                    />
                    <button
                      onClick={() => setProductImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >×</button>
                  </div>
                ))}
                {productImages.length < 3 && (
                  <button
                    onClick={() => productFileRef.current?.click()}
                    className="w-20 h-20 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span className="text-xs">Agregar</span>
                  </button>
                )}
              </div>
              <input ref={productFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleProductFile(f); e.target.value = ''; }} />
            </div>

            {/* People mode toggle */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                ¿Aparecen personas usando el producto?
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPeopleMode('none'); setReferenceImages([]); }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                    peopleMode === 'none'
                      ? 'border-[#e42820] bg-[#e42820]/10 text-[#e42820]'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  No — solo producto
                </button>
                <button
                  onClick={() => setPeopleMode('real')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                    peopleMode === 'real'
                      ? 'border-[#e42820] bg-[#e42820]/10 text-[#e42820]'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Sí — con modelo
                </button>
              </div>
            </div>

            {/* Reference images — only when peopleMode is real */}
            {peopleMode === 'real' && (
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Foto de referencia de persona <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">El sistema usará estas fotos para mantener el perfil de la persona en los creativos</p>
              <div className="flex gap-2">
                {referenceImages.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`} alt="Ref" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setReferenceImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center"
                    >×</button>
                  </div>
                ))}
                {referenceImages.length < 2 && (
                  <button
                    onClick={() => referenceFileRef.current?.click()}
                    className="w-16 h-16 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-300 hover:border-gray-300 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </div>
              <input ref={referenceFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleReferenceFile(f); e.target.value = ''; }} />
            </div>
            )}

            {/* Sliders */}
            <div className="mb-7 space-y-5">
              {/* Product angles slider */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-blue-800">Ángulos de Producto</label>
                  <span className="text-lg font-bold text-blue-700">{productCount === 0 ? '0 — omitir' : productCount}</span>
                </div>
                <p className="text-xs text-blue-600 mb-3">El argumento habla del producto (características, materiales, precio)</p>
                <input
                  type="range" min={0} max={3} value={productCount}
                  onChange={e => setProductCount(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-blue-400 mt-1">
                  <span>0</span><span>1</span><span>2</span><span>3</span>
                </div>
              </div>

              {/* Category angles slider */}
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-orange-800">Ángulos de Categoría</label>
                  <span className="text-lg font-bold text-orange-700">{categoryCount === 0 ? '0 — omitir' : categoryCount}</span>
                </div>
                <p className="text-xs text-orange-600 mb-3">El argumento habla del contexto, necesidad o estilo de vida</p>
                <input
                  type="range" min={0} max={3} value={categoryCount}
                  onChange={e => setCategoryCount(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-orange-400 mt-1">
                  <span>0</span><span>1</span><span>2</span><span>3</span>
                </div>
              </div>

              <div className="text-center text-sm text-gray-500 font-medium">
                Total: <span className="text-gray-900 font-bold">{totalAngles}</span> ángulos a testear
              </div>
            </div>

            <button
              onClick={generateP1}
              disabled={!brief.trim() || !brandKit || (productCount === 0 && categoryCount === 0) || isSubmitting}
              className="w-full bg-[#e42820] text-white font-semibold py-3 rounded-xl hover:bg-[#c82019] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Generar ángulos
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Generating ─────────────────────────────────────────────────────────
  if (view === 'p1-generating') {
    const pct = p1Total > 0 ? Math.round((p1Done / p1Total) * 100) : 0;
    const productAngles = p1Angles.filter(a => a.level === 'product');
    const categoryAngles = p1Angles.filter(a => a.level === 'category');

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 flex items-center justify-center">
          <div className="max-w-md w-full px-4 py-12 text-center">
            <GameHeader view={view} />
            <div className="w-16 h-16 bg-[#e42820]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[#e42820] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              {p1Angles.length === 0 ? 'Investigando tu producto...' : 'Creando tus anuncios...'}
            </h2>
            <p className="text-sm text-gray-500 mb-1">
              {p1Angles.length === 0
                ? 'Analizando el producto y definiendo los mejores ángulos de mensaje'
                : `Generando imágenes · ${p1Done} de ${p1Total}`}
            </p>
            <p className="text-xs text-gray-400 mb-3">{fmtElapsed(p1Elapsed)}</p>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4 text-left">
              <p className="text-sm font-semibold text-amber-800 mb-1">☕ Esto tarda entre 2 y 4 minutos — buen momento para un café.</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                No es lento por casualidad: primero analizamos tu producto en detalle, luego construimos estrategias de mensaje distintas, y después generamos cada imagen con IA de alta calidad. Todo eso junto lleva su tiempo, pero vale la pena.
              </p>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
              {p1Total > 0 ? (
                <div
                  className="h-2 bg-[#e42820] rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-2 bg-[#e42820]/60 rounded-full animate-pulse" style={{ width: '30%' }} />
              )}
            </div>

            {/* Cancel button */}
            <button
              onClick={() => { p1AbortRef.current?.abort(); }}
              className="mt-2 mb-4 text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              Cancelar generación
            </button>

            {/* Progressive image grid — skeleton until each image arrives */}
            {p1Angles.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-sm mx-auto">
                {p1Angles.map(a => {
                  const img = p1Images.find(i => i.angleKey === a.key);
                  const isProduct = a.level === 'product';
                  return (
                    <div key={a.key} className="relative rounded-xl overflow-hidden aspect-[2/3] bg-gray-100 shadow-sm">
                      {img ? (
                        <>
                          <img
                            src={`data:image/png;base64,${img.base64}`}
                            alt={a.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
                            <p className="text-white text-[10px] font-semibold leading-tight truncate">{a.name}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-full h-full animate-pulse bg-gradient-to-br from-gray-200 to-gray-300" />
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                            <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <p className="text-[10px] text-gray-400 font-medium px-2 text-center leading-tight">{a.name}</p>
                          </div>
                          <div className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${isProduct ? 'bg-blue-400' : 'bg-orange-400'}`} />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Live ───────────────────────────────────────────────────────────────
  if (view === 'p1-live') {
    const productAngles = p1Angles.filter(a => a.level === 'product');
    const categoryAnglesArr = p1Angles.filter(a => a.level === 'category');

    const renderAngleGrid = (angles: MessageAngle[]) => (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {angles.map(angle => {
          const img = p1Images.find(i => i.angleKey === angle.key);
          return (
            <div key={angle.key} className="relative rounded-xl border border-gray-200 overflow-hidden bg-white">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${img.base64}`}
                  alt={angle.name}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-gray-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              <div className="p-2">
                <p className="text-xs font-semibold text-gray-700 truncate">{angle.name}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">&ldquo;{angle.hook}&rdquo;</p>
              </div>
              {img && (
                <button
                  onClick={() => downloadImage(img.base64, `angulo-${angle.key}.png`)}
                  className="absolute top-2 right-2 p-1 bg-white/90 rounded-lg text-gray-400 hover:text-gray-700 shadow-sm"
                  title="Descargar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    );

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">Tus ángulos están listos para lanzar</h1>
              <p className="text-sm text-gray-500 mt-1">Descargá las imágenes, subí a Meta y dejá correr el test.</p>
            </div>

            {p1Error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{p1Error}</div>
            )}
            {syncWarning && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start justify-between gap-3">
                <span>⚠️ {syncWarning}</span>
                <button onClick={() => setSyncWarning('')} className="text-amber-500 hover:text-amber-700 shrink-0 text-xs">Cerrar</button>
              </div>
            )}

            {/* Download all */}
            {p1Images.length > 0 && (
              <button
                onClick={() => p1Images.forEach(img => downloadImage(img.base64, `angulo-${img.angleKey}.png`))}
                className="mb-6 flex items-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2 hover:border-gray-300 hover:bg-white transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar todas ({p1Images.length})
              </button>
            )}

            {/* Product angles section */}
            {productAngles.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Ángulos de Producto</span>
                </div>
                {renderAngleGrid(productAngles)}
              </div>
            )}

            {/* Category angles section */}
            {categoryAnglesArr.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">Ángulos de Categoría</span>
                </div>
                {renderAngleGrid(categoryAnglesArr)}
              </div>
            )}

            {/* P1 Format Adaptations */}
            {p1Images.length > 0 && (
              <div className="mb-8 bg-white border border-gray-200 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 text-sm">Adaptaciones de formato</h2>
                    <p className="text-xs text-gray-400">Generá versiones Story y Cuadrado de tus ángulos para testear en más placements</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {[{ key: 'story', label: 'Story / Reels (9:16)' }, { key: 'square', label: 'Cuadrado 1:1' }].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setP1AdaptFormats(prev => prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        p1AdaptFormats.includes(f.key)
                          ? 'bg-purple-100 border-purple-400 text-purple-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={generateP1Adaptations}
                  disabled={p1AdaptFormats.length === 0 || p1Adapting}
                  className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
                    p1Adapting
                      ? 'bg-purple-600 text-white cursor-wait'
                      : p1AdaptFormats.length === 0
                        ? 'bg-purple-200 text-purple-400 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {p1Adapting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      {p1AdaptProgress ? `Procesando ángulo ${p1AdaptProgress.done + 1} de ${p1AdaptProgress.total}...` : 'Generando adaptaciones...'}
                    </span>
                  ) : 'Generar adaptaciones'}
                </button>
                {p1AdaptedImages.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Adaptaciones generadas</p>
                    {p1Images.map(img => {
                      const adapted = p1AdaptedImages.filter(a => a.angleKey === img.angleKey);
                      if (adapted.length === 0) return null;
                      const angle = p1Angles.find(a => a.key === img.angleKey);
                      return (
                        <div key={img.angleKey} className="mb-4">
                          <p className="text-xs font-semibold text-gray-600 mb-2">{angle?.name || img.angleKey}</p>
                          <div className="flex flex-wrap gap-3">
                            {adapted.map((a, i) => (
                              <div key={i} className="relative rounded-xl overflow-hidden border border-gray-200 bg-white w-24">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`data:image/png;base64,${a.base64}`} alt={a.label} className="w-full object-cover" style={{ aspectRatio: a.format === 'story' ? '9/16' : '1/1' }} />
                                <div className="p-1 text-[10px] text-center text-gray-500 truncate">{a.label}</div>
                                <button
                                  onClick={() => downloadExact(a.base64, `angulo-${a.angleKey}-${a.format}.png`, a.format)}
                                  className="absolute top-1 right-1 p-1 bg-white/90 rounded text-gray-500 hover:text-gray-800 shadow-sm"
                                  title="Descargar"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Launch checklist */}
            <div className="mb-8 bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-[#e42820]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#e42820]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <h2 className="font-bold text-gray-900 text-sm">Checklist de lanzamiento en Meta</h2>
              </div>
              <ol className="space-y-3">
                {[
                  'Subí las imágenes a Meta Ads Manager',
                  `1 campaña · 1 conjunto de anuncios · ${p1Angles.length} anuncios (uno por ángulo) con el mismo presupuesto`,
                  'Audiencia fría: Intereses o Broad',
                  'Objetivo de campaña: Compras',
                  'Dejá correr al menos 7–15 días antes de sacar conclusiones',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>

            {/* CTA */}
            <div className="sticky bottom-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-lg flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">¿Ya corriste el test?</p>
                  <p className="text-xs text-gray-400">Cuando tengas datos de Meta, analizá los resultados</p>
                </div>
                <button
                  onClick={() => setView('p1-review')}
                  className="shrink-0 bg-[#e42820] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#c82019] transition-colors text-sm whitespace-nowrap"
                >
                  Ya tengo resultados →
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── P1 Review ─────────────────────────────────────────────────────────────
  if (view === 'p1-review') {
    const productAngles = p1Angles.filter(a => a.level === 'product');
    const categoryAnglesArr = p1Angles.filter(a => a.level === 'category');
    const currentWinners = p1Angles.filter(a => (angleStatuses[a.key] || 'active') === 'winner');

    const cpaNum = parseFloat(targetCpa.replace(/,/g, '.')) || 0;
    const dailyBudgetNum = parseFloat(dailyBudget.replace(/,/g, '.')) || 0;
    const totalAccountPurchasesNum = parseInt(totalAccountPurchases, 10) || 0;

    // Auto-calculate days from launchDate
    const campaignLaunchDate = launchDate ? new Date(launchDate) : null;
    const daysNum = campaignLaunchDate
      ? Math.max(0, Math.floor((Date.now() - campaignLaunchDate.getTime()) / 86400000))
      : 0;
    const launchDateFormatted = campaignLaunchDate
      ? campaignLaunchDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
      : '';

    // Aggregate totals derived from per-angle metrics
    const totalPurchasesAgg = Object.values(angleMetrics)
      .reduce((sum, m) => sum + (parseInt(m.purchases, 10) || 0), 0);
    const totalSpendAgg = Object.values(angleMetrics)
      .reduce((sum, m) => sum + (parseFloat(m.spend.replace(/,/g, '.')) || 0), 0);
    const hasAnyMetrics = p1Angles.some(a => {
      const m = angleMetrics[a.key];
      return m && (m.purchases !== '' || m.spend !== '');
    });
    const guidance = hasAnyMetrics && launchDate !== ''
      ? getGuidanceMessage(
          daysNum,
          totalPurchasesAgg,
          accountType,
          totalSpendAgg,
          targetCpa,
          p1Angles.length,
          dailyBudgetNum,
          totalAccountPurchasesNum,
        )
      : null;

    const countByLight = (light: string) => p1Angles.filter(a => {
      const m = angleMetrics[a.key] || { purchases: '', spend: '' };
      const p = parseInt(m.purchases, 10) || 0;
      const s = parseFloat(m.spend.replace(/,/g, '.')) || 0;
      const rec = getAngleRec(p, s, daysNum, cpaNum, accountType, m.purchases !== '' || m.spend !== '', dailyBudgetNum, totalAccountPurchasesNum);
      return rec?.light === light;
    }).length;

    const setStatus = (key: string, status: AngleStatus) => {
      setAngleStatuses(prev => {
        const next = { ...prev, [key]: status };
        // Use in-memory p1Images as source of truth — stored.p1 may be empty
        // if the initial localStorage save failed silently (quota exceeded).
        if (sessionId) {
          saveLsImages(sessionId, p1Images, next, launchDate);
        }
        return next;
      });
    };

    const updateAngleMetric = (key: string, field: 'purchases' | 'spend', value: string) => {
      setAngleMetrics(prev => {
        const existing = prev[key] || { purchases: '', spend: '' };
        const next = { ...prev, [key]: { ...existing, [field]: value } };
        if (sessionId) saveAngleMetrics(sessionId, next);
        return next;
      });
    };

    const renderReviewCard = (angle: MessageAngle) => {
      const img = p1Images.find(i => i.angleKey === angle.key);
      const status = angleStatuses[angle.key] || 'active';
      const isWinner = status === 'winner';
      const isOff = status === 'off';
      const isProduct = angle.level === 'product';

      const metrics = angleMetrics[angle.key] || { purchases: '', spend: '' };
      const purchasesNum = parseInt(metrics.purchases, 10);
      const spendNum = parseFloat(metrics.spend.replace(/,/g, '.'));
      const hasData = metrics.purchases !== '' || metrics.spend !== '';
      const rec = getAngleRec(
        isNaN(purchasesNum) ? 0 : purchasesNum,
        isNaN(spendNum) ? 0 : spendNum,
        daysNum,
        cpaNum,
        accountType,
        hasData,
        dailyBudgetNum,
        totalAccountPurchasesNum,
      );

      const lightColor = isWinner ? 'green' : isOff ? 'gray' : (rec?.light || 'gray');
      const lightStyles: Record<string, string> = {
        green: 'bg-green-500 shadow-green-400/60',
        yellow: 'bg-yellow-400 shadow-yellow-300/60',
        orange: 'bg-orange-500 shadow-orange-400/60',
        red: 'bg-red-500 shadow-red-400/60',
        gray: 'bg-gray-300',
      };
      const borderStyles: Record<string, string> = {
        green: 'border-green-400 shadow-lg shadow-green-400/20',
        yellow: 'border-yellow-300',
        orange: 'border-orange-300',
        red: 'border-red-300',
        gray: 'border-gray-200',
      };

      const burnPct = rec?.burnPct;
      const burnBarColor = burnPct === undefined ? '' : burnPct >= 100 ? 'bg-red-500' : burnPct >= 70 ? 'bg-orange-400' : 'bg-green-500';

      return (
        <div
          key={angle.key}
          className={`relative rounded-xl border-2 overflow-hidden bg-white transition-all duration-300 ${
            isOff ? 'border-gray-200 opacity-40' : borderStyles[lightColor]
          }`}
        >
          {isOff && (
            <div className="absolute inset-0 bg-gray-400/20 z-10 rounded-xl pointer-events-none" />
          )}

          {/* Semáforo indicator */}
          <div className="absolute top-2 right-2 z-20">
            {isWinner ? (
              <span className="text-xl leading-none">👑</span>
            ) : (
              <span className={`block w-3.5 h-3.5 rounded-full shadow-md ${lightStyles[lightColor]} ${lightColor !== 'gray' ? 'animate-pulse' : ''}`} />
            )}
          </div>

          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${img.base64}`} alt={angle.name} className="w-full aspect-[2/3] object-cover" />
          ) : (
            <div className="w-full aspect-[2/3] bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          <div className="p-3 relative z-20">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isProduct ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                {isProduct ? 'Producto' : 'Categoría'}
              </span>
              <span className="text-xs text-gray-500 font-medium truncate">{angle.name}</span>
            </div>
            <p className={`text-sm font-semibold text-gray-900 leading-snug mb-3 ${isOff ? 'line-through text-gray-400' : ''}`}>
              &ldquo;{angle.hook}&rdquo;
            </p>

            {/* Burn bar */}
            {burnPct !== undefined && cpaNum > 0 && !isWinner && (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                  <span>Presupuesto quemado</span>
                  <span className="font-semibold">{Math.min(burnPct, 999)}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${burnBarColor}`}
                    style={{ width: `${Math.min(burnPct, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Per-angle metrics */}
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Ventas</label>
                <input
                  type="number" min={0} value={metrics.purchases}
                  onChange={e => updateAngleMetric(angle.key, 'purchases', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Gasto ($)</label>
                <input
                  type="text" value={metrics.spend}
                  onChange={e => updateAngleMetric(angle.key, 'spend', e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                />
              </div>
            </div>

            {/* CPA real */}
            {!isNaN(purchasesNum) && purchasesNum > 0 && !isNaN(spendNum) && spendNum > 0 && (
              <p className="text-[10px] text-gray-500 mb-2">
                Costo por venta: <strong className="text-gray-800">${(spendNum / purchasesNum).toFixed(0)}</strong>
                {cpaNum > 0 && <span className={spendNum / purchasesNum <= cpaNum ? ' text-green-600' : ' text-orange-600'}> ({Math.round(spendNum / purchasesNum / cpaNum * 100)}% del objetivo)</span>}
              </p>
            )}

            {/* Recommendation */}
            {rec && !isWinner && (
              <div className={`text-[11px] font-medium px-2 py-1.5 rounded-lg border mb-2 ${rec.color}`}>
                {rec.label}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setStatus(angle.key, isWinner ? 'active' : 'winner')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                  isWinner ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-green-300 hover:text-green-700'
                }`}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {isWinner ? 'Ganador ✓' : 'Ganador'}
              </button>
              <button
                onClick={() => setStatus(angle.key, isOff ? 'active' : 'off')}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                  isOff ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600'
                }`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {isOff ? 'Reactivar' : 'Apagar'}
              </button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 pb-32">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            <div className="mb-6">
              <h1 className="text-xl font-bold text-gray-900">Semáforo de campaña</h1>
              <p className="text-sm text-gray-500 mt-1">Cargá los resultados de cada anuncio para ver qué hacer con cada uno.</p>
            </div>

            {/* Campaign phase header */}
            <div className="mb-4 bg-white border border-gray-200 rounded-2xl p-4">
              {/* Phase strip */}
              <div className="flex items-center gap-2 mb-4">
                {(['waiting','deciding','winner'] as const).map((ph, i) => {
                  const phaseLabel = ['Esperando datos','Tomando decisiones','Ganador encontrado'][i];
                  const active = guidance?.phase === ph || (!guidance && ph === 'waiting');
                  return (
                    <div key={ph} className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full transition-all ${active ? (ph === 'winner' ? 'bg-green-500 animate-pulse' : ph === 'deciding' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-400') : 'bg-gray-200'}`} />
                      <span className={`text-[10px] font-semibold truncate ${active ? 'text-gray-900' : 'text-gray-300'}`}>{phaseLabel}</span>
                      {i < 2 && <div className="flex-1 h-px bg-gray-200 min-w-[8px]" />}
                    </div>
                  );
                })}
              </div>

              {/* Launch date + days counter */}
              <div className="flex flex-wrap gap-3 items-end mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">¿Cuándo lanzaste la campaña?</label>
                  <input
                    type="date"
                    value={launchDate ? launchDate.slice(0, 10) : ''}
                    onChange={e => {
                      const d = e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : '';
                      setLaunchDate(d);
                      if (sessionId) {
                        saveLsImages(sessionId, p1Images, angleStatuses, d);
                      }
                    }}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]"
                  />
                </div>
                {launchDate && (
                  <div className="pb-1.5">
                    <span className="text-sm font-bold text-gray-900">Día {daysNum}</span>
                    <span className="text-xs text-gray-400 ml-1">desde el {launchDateFormatted}</span>
                  </div>
                )}
              </div>

              {/* Config inputs */}
              <div className="flex flex-wrap gap-3 items-end mb-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Costo objetivo por venta ($)
                    <span className="ml-1 group relative inline-block cursor-help">
                      <span className="text-blue-500 text-[11px] border border-blue-300 rounded-full px-1 bg-blue-50">?</span>
                      <span className="hidden group-hover:block absolute left-0 bottom-full mb-1.5 w-56 bg-gray-900 text-white text-[11px] rounded-lg p-2.5 z-10 leading-relaxed shadow-lg">
                        Lo máximo que querés gastar en publicidad para conseguir una venta. Ej: si tu producto vale $10.000, poné $3.000 o $4.000.
                      </span>
                    </span>
                  </label>
                  <input type="text" value={targetCpa} onChange={e => setTargetCpa(e.target.value)} placeholder="ej: 3000"
                    className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Presupuesto diario ($)
                    <span className="ml-1 group relative inline-block cursor-help">
                      <span className="text-blue-500 text-[11px] border border-blue-300 rounded-full px-1 bg-blue-50">?</span>
                      <span className="hidden group-hover:block absolute left-0 bottom-full mb-1.5 w-56 bg-gray-900 text-white text-[11px] rounded-lg p-2.5 z-10 leading-relaxed shadow-lg">
                        Lo que gastás por día en total en la campaña. Con menos de $20/día los umbrales para apagar son más estrictos.
                      </span>
                    </span>
                  </label>
                  <input type="text" value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} placeholder="ej: 20"
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#e42820]/20 focus:border-[#e42820]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Tipo de cuenta
                    <span className="ml-1 group relative inline-block cursor-help">
                      <span className="text-blue-500 text-[11px] border border-blue-300 rounded-full px-1 bg-blue-50">?</span>
                      <span className="hidden group-hover:block absolute left-0 bottom-full mb-1.5 w-60 bg-gray-900 text-white text-[11px] rounded-lg p-2.5 z-10 leading-relaxed shadow-lg">
                        <strong>Nueva:</strong> menos de 50 compras en el historial de la cuenta en ese nicho. Los umbrales son más tolerantes — el algoritmo necesita tiempo para aprender.<br/><br/>
                        <strong>Con historial:</strong> la cuenta ya tiene datos suficientes para tomar decisiones rápidas.
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    <button onClick={() => setAccountType('new')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${accountType === 'new' ? 'bg-[#e42820]/10 border-[#e42820] text-[#e42820]' : 'bg-white border-gray-200 text-gray-500'}`}>
                      Nueva
                    </button>
                    <button onClick={() => setAccountType('established')} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${accountType === 'established' ? 'bg-[#e42820]/10 border-[#e42820] text-[#e42820]' : 'bg-white border-gray-200 text-gray-500'}`}>
                      Con historial
                    </button>
                  </div>
                </div>
              </div>

              {/* Semáforo summary */}
              {hasAnyMetrics && (
                <div className="flex gap-3 text-xs mb-3">
                  {countByLight('red') > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /><strong>{countByLight('red')}</strong> apagar</span>}
                  {(countByLight('orange') + countByLight('yellow')) > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /><strong>{countByLight('orange') + countByLight('yellow')}</strong> vigilar</span>}
                  {countByLight('green') > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /><strong>{countByLight('green')}</strong> escalar</span>}
                  <span className="ml-auto text-gray-400">Total gasto: <strong className="text-gray-700">${totalSpendAgg.toFixed(0)}</strong></span>
                </div>
              )}

              {guidance && (
                <div className={`text-sm px-3 py-2.5 rounded-lg border font-medium ${guidance.color}`}>
                  {guidance.text}
                </div>
              )}

              {guidance?.action === 'regenerate' && (
                <button
                  onClick={() => {
                    const failedAngles = p1Angles.filter(a => (angleStatuses[a.key] || 'active') !== 'winner');
                    setExcludeAngles(failedAngles);
                    resetToSetup(true);
                  }}
                  className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#e42820] border border-[#e42820]/30 bg-[#e42820]/5 hover:bg-[#e42820]/10 px-4 py-2 rounded-xl transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Probar nuevos ángulos (distintos a los que no funcionaron)
                </button>
              )}
            </div>

            {/* Product angles */}
            {productAngles.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">Ángulos de Producto</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productAngles.map(renderReviewCard)}
                </div>
              </div>
            )}

            {/* Category angles */}
            {categoryAnglesArr.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">Ángulos de Categoría</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryAnglesArr.map(renderReviewCard)}
                </div>
              </div>
            )}
          </div>

          {/* Sticky bottom bar */}
          <div className="fixed bottom-0 left-0 right-0 md:left-56 z-30 p-4 bg-white border-t border-gray-200 shadow-lg">
            <div className="max-w-4xl mx-auto flex items-center gap-4">
              {currentWinners.length > 0 ? (
                <>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {currentWinners.length} ganador{currentWinners.length > 1 ? 'es' : ''} seleccionado{currentWinners.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      {p2Creatives.length > 0 ? `${p2Creatives.length} creativos PEC ya generados` : `Se generarán ${currentWinners.length * 3} creativos PEC`}
                    </p>
                  </div>
                  {p2Creatives.length > 0 ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setView('p2-results')}
                        className="bg-[#e42820] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#c82019] transition-colors text-sm"
                      >
                        Ver PEC →
                      </button>
                      <button
                        onClick={generateP2}
                        className="border border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                        title="Genera nuevos creativos PEC distintos a los existentes"
                      >
                        Re-escalar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={generateP2}
                      className="shrink-0 bg-[#e42820] text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-[#c82019] transition-colors text-sm"
                    >
                      Escalar al Paso 2 →
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Marcá al menos un ángulo ganador para continuar</p>
                  </div>
                  <button
                    onClick={() => resetToSetup(true)}
                    className="shrink-0 text-sm font-semibold px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    Generar más ángulos
                  </button>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── P2 Generating ─────────────────────────────────────────────────────────
  if (view === 'p2-generating') {
    const pct = p2Total > 0 ? Math.round((p2Done / p2Total) * 100) : 0;
    const winningAngles = p1Angles.filter(a => winnerKeys.includes(a.key));

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 flex items-center justify-center">
          <div className="max-w-md w-full px-4 py-12 text-center">
            <GameHeader view={view} />
            <div className="w-16 h-16 bg-[#e42820]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[#e42820] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Generando campaña PEC</h2>
            <p className="text-sm text-gray-500 mb-2">
              {p2Done} de {p2Total} creativos listos
            </p>
            <p className="text-xs text-gray-400 mb-6">{fmtElapsed(p2Elapsed)}</p>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-6 overflow-hidden">
              <div
                className="h-2 bg-[#e42820] rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Cancel button */}
            <button
              onClick={() => { p2AbortRef.current?.abort(); }}
              className="mb-4 text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              Cancelar generación
            </button>

            <div className="flex flex-wrap gap-4 justify-center">
              {winningAngles.map(a => (
                <div key={a.key} className="text-left">
                  <p className="text-xs font-bold text-gray-600 mb-1.5">{a.name}</p>
                  <div className="flex gap-1.5">
                    {(['P', 'E', 'C'] as const).map(stage => {
                      const isDone = p2Creatives.some(c => c.angleKey === a.key && c.stage === stage);
                      return (
                        <span key={stage} className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                          isDone
                            ? stage === 'P' ? 'bg-purple-100 text-purple-700'
                            : stage === 'E' ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}>{stage}</span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── P2 Results ────────────────────────────────────────────────────────────
  if (view === 'p2-results') {
    const stages: Array<{ code: 'P' | 'E' | 'C'; label: string; description: string }> = [
      { code: 'P', label: 'Prospección', description: 'Atraer nuevas audiencias que no te conocen' },
      { code: 'E', label: 'Evaluación', description: 'Convencer a quienes ya mostraron interés' },
      { code: 'C', label: 'Conversión', description: 'Cerrar la compra del que ya está convencido' },
    ];

    const winningAngles = p1Angles.filter(a => winnerKeys.includes(a.key));

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-5xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            {/* Header */}
            <div className="flex items-start justify-between mb-6 gap-4">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Campaña PEC lista</h1>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {winningAngles.map(a => (
                    <span key={a.key} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.level === 'product' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setView('p1-review')}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Ver Paso 1
                </button>
                <button
                  onClick={() => setView('sessions')}
                  className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Mis proyectos
                </button>
              </div>
            </div>

            {/* Download disclaimer */}
            <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>Las imágenes se guardan solo en este navegador. Descargalas antes de salir o cambiar de dispositivo.</span>
            </div>

            {p2Error && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{p2Error}</div>
            )}
            {syncWarning && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start justify-between gap-3">
                <span>⚠️ {syncWarning}</span>
                <button onClick={() => setSyncWarning('')} className="text-amber-500 hover:text-amber-700 shrink-0 text-xs">Cerrar</button>
              </div>
            )}

            {p2Creatives.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No se generaron creativos.</div>
            ) : (
              <div className="space-y-10">
                {stages.map(stage => {
                  const stageCreatives = p2Creatives.filter(c => c.stage === stage.code);
                  if (stageCreatives.length === 0) return null;
                  return (
                    <div key={stage.code}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-8 h-8 ${STAGE_BG[stage.code]} rounded-lg flex items-center justify-center shrink-0`}>
                          <span className="text-white text-xs font-bold">{stage.code}</span>
                        </div>
                        <div>
                          <h2 className="font-bold text-gray-900">{stage.label}</h2>
                          <p className="text-xs text-gray-400">{stage.description}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stageCreatives.map(creative => (
                          <div key={creative.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`data:image/png;base64,${creative.base64}`}
                              alt={`${creative.angleName} · ${stage.label}`}
                              className="w-full aspect-[2/3] object-cover"
                            />
                            <div className="p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STAGE_COLORS[stage.code]}`}>
                                  {creative.formatName}
                                </span>
                                <span className="text-[10px] text-gray-400">{creative.angleName}</span>
                              </div>
                              <p className="text-xs font-semibold text-gray-800 leading-snug">{creative.headline}</p>
                              {creative.subline && <p className="text-xs text-gray-400 mt-0.5">{creative.subline}</p>}
                              <button
                                onClick={() => downloadImage(creative.base64, `pec-${stage.code}-${creative.angleKey}.png`)}
                                className="mt-2 w-full text-xs text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Descargar
                              </button>
                              <button
                                onClick={() => setP2CardRefineOpen(prev => ({ ...prev, [creative.id]: !prev[creative.id] }))}
                                className="mt-1.5 w-full text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 bg-indigo-50 hover:bg-indigo-100 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                {p2CardRefineOpen[creative.id] ? 'Cerrar' : 'Afinar'}
                              </button>
                              {p2CardRefineOpen[creative.id] && (
                                <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                                  <div className="flex flex-wrap gap-1">
                                    {['Fondo más oscuro', 'Más contraste', 'Texto más grande', 'Producto más prominente', 'Más minimalista'].map(preset => (
                                      <button
                                        key={preset}
                                        onClick={() => !p2RefiningId && setP2RefineInputs(prev => ({ ...prev, [creative.id]: preset }))}
                                        disabled={!!p2RefiningId}
                                        className="text-[10px] px-2 py-0.5 rounded-full border bg-white hover:bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40"
                                      >
                                        {preset}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-1.5">
                                    <input
                                      type="text"
                                      value={p2RefineInputs[creative.id] || ''}
                                      onChange={e => setP2RefineInputs(prev => ({ ...prev, [creative.id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter' && !p2RefiningId && (p2RefineInputs[creative.id] || '').trim()) applyP2Refinement(creative.id); }}
                                      placeholder="¿Qué cambiar?"
                                      disabled={!!p2RefiningId}
                                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#e42820] disabled:opacity-50"
                                    />
                                    <button
                                      onClick={() => applyP2Refinement(creative.id)}
                                      disabled={!(p2RefineInputs[creative.id] || '').trim() || !!p2RefiningId}
                                      className="bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors text-xs shrink-0"
                                    >
                                      {p2RefiningId === creative.id ? (
                                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
                                      ) : 'Aplicar'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Go to Refine or Paso 3 */}
            {p2Creatives.length > 0 && (
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setP2RefineInputs({});
                    setP2RefineHistories({});
                    setP2RefineImageHistories({});
                    setView('p2-refine');
                  }}
                  className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Afinar creativos
                </button>
                <button
                  onClick={() => {
                    setP3AdaptSourceIds(p2Creatives.map(c => c.id));
                    setP3AdaptFormats([]);
                    setP3AdaptedImages([]);
                    setView('p3');
                  }}
                  className="flex items-center gap-2 bg-white border border-purple-200 text-purple-700 font-semibold px-6 py-3 rounded-xl hover:bg-purple-50 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  <span>Adaptar formatos</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ── P2 Refine ─────────────────────────────────────────────────────────────
  if (view === 'p2-refine') {
    const QUICK_PRESETS = [
      'Texto más grande', 'Menos texto, más imagen', 'Fondo más oscuro',
      'Fondo blanco limpio', 'Más contraste', 'Producto más prominente',
      'Reducir elementos visuales', 'Colores más vibrantes',
    ];

    const goToP3 = () => {
      setP3AdaptSourceIds(p2Creatives.map(c => c.id));
      setP3AdaptFormats([]);
      setP3AdaptedImages([]);
      setView('p3');
    };

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0 pb-32">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Afiná los creativos</h1>
                <p className="text-sm text-gray-500 mt-1">Ajustá textos, elementos o composición antes de adaptar formatos.</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setView('p2-results')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Volver
                </button>
                <button
                  onClick={goToP3}
                  className="bg-[#e42820] hover:bg-[#c41f18] text-white font-semibold px-5 py-2 rounded-xl transition-colors text-sm flex items-center gap-2"
                >
                  Adaptar formatos
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}

            <div className="space-y-6">
              {p2Creatives.map((creative) => {
                const isRefining = p2RefiningId === creative.id;
                const busy = !!p2RefiningId;
                const input = p2RefineInputs[creative.id] || '';
                const history = p2RefineHistories[creative.id] || [];
                const imgHistory = p2RefineImageHistories[creative.id] || [];

                return (
                  <div key={creative.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="flex flex-col md:flex-row gap-0">

                      {/* Image */}
                      <div className="relative md:w-72 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:image/png;base64,${creative.base64}`}
                          alt={creative.angleName}
                          className={`w-full h-full object-cover transition-all duration-300 ${isRefining ? 'blur-sm' : ''}`}
                          style={{ maxHeight: '480px', objectFit: 'cover' }}
                        />
                        {isRefining && (
                          <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-[3px] border-[#e42820] border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-gray-700 font-medium">Aplicando ajuste...</p>
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex-1 p-5 space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                creative.stage === 'P' ? 'bg-violet-100 text-violet-700' :
                                creative.stage === 'E' ? 'bg-blue-100 text-blue-700' :
                                'bg-green-100 text-green-700'
                              }`}>{creative.stageLabel}</span>
                              <span className="text-xs text-gray-400 truncate">{creative.angleName} · {creative.formatName}</span>
                            </div>
                            <p className="font-semibold text-gray-900 text-sm leading-snug">{creative.headline}</p>
                          </div>
                          <button
                            onClick={() => downloadImage(creative.base64, `pec-${creative.stage}-${creative.angleKey}.png`)}
                            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-3"
                            title="Descargar"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>

                        {/* History */}
                        {history.length > 0 && (
                          <div className="space-y-1 max-h-20 overflow-y-auto">
                            {history.map((h, j) => (
                              <div key={j} className="bg-gray-50 rounded-lg px-3 py-1.5 text-xs text-gray-500 flex items-start gap-1.5">
                                <span className="text-[#e42820] mt-0.5 shrink-0">✓</span>{h}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quick presets */}
                        <div className="space-y-2">
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Ajustes rápidos</p>
                          <div className="flex flex-wrap gap-1.5">
                            {QUICK_PRESETS.map(preset => (
                              <button
                                key={preset}
                                onClick={() => { if (!busy) setP2RefineInputs(prev => ({ ...prev, [creative.id]: preset })); }}
                                disabled={busy}
                                className="text-xs px-2.5 py-1 rounded-lg border bg-white hover:bg-gray-100 border-gray-200 text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40"
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Input + actions */}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={input}
                            onChange={e => { if (!busy) setP2RefineInputs(prev => ({ ...prev, [creative.id]: e.target.value })); }}
                            onKeyDown={e => { if (e.key === 'Enter' && !busy && input.trim()) applyP2Refinement(creative.id); }}
                            placeholder="O escribí tu ajuste..."
                            disabled={busy}
                            className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#e42820] text-sm disabled:opacity-50"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => applyP2Refinement(creative.id)}
                              disabled={!input.trim() || busy}
                              className="flex-1 sm:flex-none bg-[#e42820] hover:bg-[#c41f18] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
                            >
                              {isRefining ? 'Aplicando...' : 'Aplicar'}
                            </button>
                            {imgHistory.length > 0 && (
                              <button
                                onClick={() => undoP2Refinement(creative.id)}
                                disabled={busy}
                                className="bg-white hover:bg-gray-100 border border-gray-200 disabled:opacity-40 text-gray-500 hover:text-gray-900 px-3 py-2.5 rounded-xl transition-colors"
                                title="Deshacer"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Paso 3 — Format Adaptation ───────────────────────────────────────────
  if (view === 'p3') {
    const FORMAT_GROUPS = [
      { group: 'RRSS', items: [
        { key: 'story', label: 'Story / Reels', desc: 'Instagram / Facebook · 9:16' },
        { key: 'instant_exp', label: 'Experiencia Instantánea', desc: 'Facebook Canvas · Full screen' },
        { key: 'square', label: 'Cuadrado 1:1', desc: 'Instagram / Facebook' },
        { key: 'landscape', label: 'Landscape 16:9', desc: 'Facebook / YouTube' },
      ]},
    ];

    const stages: Array<{ code: 'P' | 'E' | 'C'; label: string }> = [
      { code: 'P', label: 'Prospección' },
      { code: 'E', label: 'Evaluación' },
      { code: 'C', label: 'Conversión' },
    ];

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar active="/one-shoot" onLogout={handleLogout} userEmail={userEmail} />
        <main className="flex-1 md:ml-56 pt-14 md:pt-0">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <GameHeader view={view} />

            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Adaptá los formatos</h1>
                <p className="text-sm text-gray-500 mt-1">Seleccioná los creativos y formatos que querés adaptar.</p>
              </div>
              <button
                onClick={() => setView('p2-results')}
                className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Volver a PEC
              </button>
            </div>

            {/* Creative selector */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Creativos a adaptar</p>
              <div className="space-y-4">
                {stages.map(stage => {
                  const stageCreatives = p2Creatives.filter(c => c.stage === stage.code);
                  if (stageCreatives.length === 0) return null;
                  return (
                    <div key={stage.code}>
                      <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STAGE_BG[stage.code]} text-white`}>{stage.code}</span>
                        {stage.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {stageCreatives.map(c => {
                          const isSelected = p3AdaptSourceIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => setP3AdaptSourceIds(prev =>
                                isSelected && prev.length > 1
                                  ? prev.filter(x => x !== c.id)
                                  : isSelected ? prev : [...prev, c.id]
                              )}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                                isSelected ? 'border-[#e42820] bg-[#e42820]/10' : 'border-gray-200 bg-white opacity-50 hover:opacity-80'
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${c.base64}`} alt="" className="w-8 h-10 rounded object-cover shrink-0" />
                              <span className="text-xs font-medium text-gray-700 max-w-[90px] truncate">{c.angleName} · {c.formatName}</span>
                              {isSelected && (
                                <svg className="w-3.5 h-3.5 text-[#e42820] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Format selector */}
            <div className="mb-6">
              {FORMAT_GROUPS.map(({ group, items }) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{group}</p>
                  <div className="flex flex-wrap gap-3">
                    {items.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setP3AdaptFormats(prev => prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key])}
                        className={`px-4 py-2.5 rounded-xl border text-left transition-all ${
                          p3AdaptFormats.includes(f.key)
                            ? 'border-[#e42820] bg-[#e42820]/10'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900">{f.label}</p>
                        <p className="text-xs text-gray-500">{f.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Generate button */}
            <button
              onClick={generateP3Adaptations}
              disabled={p3AdaptFormats.length === 0 || p3AdaptSourceIds.length === 0 || p3Generating}
              className="mb-8 bg-[#e42820] text-white font-semibold px-6 py-3 rounded-xl hover:bg-[#c82019] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
            >
              {p3Generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generando adaptaciones...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  {p3AdaptFormats.length > 0
                    ? `Generar ${p3AdaptFormats.length} formato${p3AdaptFormats.length > 1 ? 's' : ''} × ${p3AdaptSourceIds.length} creativo${p3AdaptSourceIds.length > 1 ? 's' : ''}`
                    : 'Seleccioná al menos un formato'}
                </>
              )}
            </button>

            {/* Adapted images */}
            {p3AdaptedImages.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Adaptaciones generadas ({p3AdaptedImages.length})</p>
                  <button
                    onClick={() => {
                      p3AdaptedImages.forEach((img, i) => {
                        const creative = p2Creatives.find(c => c.id === img.creativeId);
                        const filename = `pec-${creative?.stage || ''}-${img.label.replace(/\s+/g, '-')}-${i + 1}.png`;
                        downloadExact(img.base64, filename, img.format);
                      });
                    }}
                    className="flex items-center gap-1.5 text-xs text-[#e42820] hover:text-[#c82019] font-medium transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar todas
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {p3AdaptedImages.map((img, i) => {
                    const creative = p2Creatives.find(c => c.id === img.creativeId);
                    return (
                      <div key={i} className="space-y-2">
                        <div className="rounded-xl overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`data:image/png;base64,${img.base64}`} alt={img.label} className="w-full" />
                        </div>
                        <p className="text-xs text-gray-500 text-center leading-snug">
                          {img.label}<br />
                          <span className="text-gray-400">{creative?.stage} · {creative?.angleName}</span>
                        </p>
                        <button
                          onClick={() => downloadExact(img.base64, `pec-${creative?.stage || ''}-${img.label.replace(/\s+/g, '-')}-${i + 1}.png`, img.format)}
                          className="w-full bg-white hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-gray-900 text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Descargar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setView('sessions')}
                className="flex-1 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors text-sm"
              >
                Mis proyectos
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
