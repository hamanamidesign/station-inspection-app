"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { gasApi } from "./lib/gasApi";
import Cropper from 'react-easy-crop';
import TaskSelect from "./components/TaskSelect";

interface Marker {
  id: number; x: number; y: number; label: string;
  color: 'red' | 'black' | '#0070c0'; shape: 'circle' | 'square';
}
type MapColor = Marker['color'];
type MapAddMode = 'marker' | 'text' | 'line';
type PhotoMarkColor = 'red' | 'black' | '#0070c0';
type PhotoMarkTool = 'ellipse' | 'line' | 'text';
type PhotoMarkTarget = 'first' | 'current';

interface PhotoEllipseMark {
  id: number;
  type: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: PhotoMarkColor;
}

interface PhotoLineMark {
  id: number;
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: PhotoMarkColor;
}

interface PhotoTextMark {
  id: number;
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: PhotoMarkColor;
}

type PhotoMark = PhotoEllipseMark | PhotoLineMark | PhotoTextMark;

interface PhotoEditorTarget {
  target: PhotoMarkTarget;
  index: number;
}

interface MapTextAnnotation {
  id: number;
  x: number;
  y: number;
  text: string;
  color: MapColor;
}

interface MapLineAnnotation {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: MapColor;
}
interface ExistingStation { 
  stationNo?: string;
  stationName: string; 
  year: string; 
  spreadsheetId?: string;
  folderId?: string;
  routeName?: string;
  routeFolderId?: string;
}

interface RouteItem {
  name: string;
  folderId: string;
  createdAt?: string;
}

interface DriveFolderItem {
  id: string;
  name: string;
}

interface DriveMapItem {
  id: string;
  name: string;
  thumbUrl: string;
}

type DrivePickerTarget =
  | { type: 'map' }
  | { type: 'karteFirst'; index: number }
  | { type: 'karteCurrent'; index: number }
  | { type: 'slope'; rowId: number; photoField: 'photo1' | 'photo2' };

interface CellStyle {
  color?: string;
  backgroundColor?: string;
}

interface SlopeTableRow {
  id: number;
  slopeType: string;
  point: string;
  place: string;
  placeSide: string;
  firstEwDirection: string;
  firstEwValue: string;
  firstNsDirection: string;
  firstNsValue: string;
  currentEwDirection: string;
  currentEwValue: string;
  currentNsDirection: string;
  currentNsValue: string;
  note: string;
  photo1?: string | null;
  photo2?: string | null;
  pointColor?: string;
  cellStyles?: Partial<Record<keyof Omit<SlopeTableRow, 'id' | 'photo1' | 'photo2' | 'cellStyles'>, CellStyle>>;
}

interface InspectorRegistration {
  routeName: string;
  year: string;
  contractor: string;
  inspectors: string[];
}

interface PdfSheetOption {
  name: string;
  label: string;
  group: 'cover' | 'photo' | 'photoPositionMap' | 'slope' | 'inclination' | 'inspectionReport';
}

interface PdfSheetGroups {
  cover: PdfSheetOption[];
  photo: PdfSheetOption[];
  photoPositionMap: PdfSheetOption[];
  slope: PdfSheetOption[];
  inclination: PdfSheetOption[];
  inspectionReport: PdfSheetOption[];
}
interface InspectionReportRow {
  id: number;
  buildingName: string;
  inspectionPlace: string;
  photoNo: string;
  finishType: string;
  firstSituation: string;
  firstEval: string;
  previousYearEval: string;
  currentSituation: string;
  structEval: string;
  impactEval: string;
  totalEval: string;
}

type InspectionReportSourceRow = Partial<InspectionReportRow> & {
  firstYear?: unknown;
  firstYearEval?: unknown;
};

interface UnsavedPhotoKarte {
  id: string;
  spreadsheetId: string;
  karteNo: string;
  stationName: string;
  year: string;
  payload: Record<string, unknown>;
  savedAt: string;
}

const INSPECTION_LIST_MASTER_ID = "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";
const INSPECTION_DRIVE_ROOT_FOLDER_ID = "1L_a6as-Wxc-BOOojkLo7BDtbx2wSZT30";
const PHOTO_DRIVE_LAST_FOLDER_STORAGE_KEY = "station-check:photo-drive-last-folder-id";
const UNSAVED_PHOTO_KARTE_LIMIT = 10;
const PHOTO_KARTE_DRAFT_DB_NAME = "station-check-photo-karte-drafts";
const PHOTO_KARTE_DRAFT_STORE = "unsavedPhotoKartes";

const openPhotoKarteDraftDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error("このブラウザでは一時保存を利用できません"));
      return;
    }

    const request = window.indexedDB.open(PHOTO_KARTE_DRAFT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_KARTE_DRAFT_STORE)) {
        const store = db.createObjectStore(PHOTO_KARTE_DRAFT_STORE, { keyPath: 'id' });
        store.createIndex('spreadsheetId', 'spreadsheetId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("一時保存データベースを開けません"));
  });

const runPhotoKarteDraftTransaction = async <T,>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openPhotoKarteDraftDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PHOTO_KARTE_DRAFT_STORE, mode);
    const request = run(transaction.objectStore(PHOTO_KARTE_DRAFT_STORE));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("一時保存の処理に失敗しました"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("一時保存の処理に失敗しました"));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error("一時保存の処理が中断されました"));
    };
  });
};

const getUnsavedPhotoKartesFromDb = async (spreadsheetId: string): Promise<UnsavedPhotoKarte[]> => {
  if (!spreadsheetId) return [];

  const rows = await runPhotoKarteDraftTransaction<UnsavedPhotoKarte[]>(
    'readonly',
    store => store.index('spreadsheetId').getAll(spreadsheetId) as IDBRequest<UnsavedPhotoKarte[]>
  );

  return rows.sort((a, b) => Number(a.karteNo) - Number(b.karteNo));
};

const saveUnsavedPhotoKarteToDb = (item: UnsavedPhotoKarte) =>
  runPhotoKarteDraftTransaction<IDBValidKey>('readwrite', store => store.put(item));

const deleteUnsavedPhotoKarteFromDb = (id: string) =>
  runPhotoKarteDraftTransaction<undefined>('readwrite', store => store.delete(id) as IDBRequest<undefined>);

const DEFAULT_ROUTE_LIST: RouteItem[] = [
  {
    name: "南海高野線",
    folderId: "1Ch_LXN-70xe5Pn6nZed5NodeOZZdMuyy",
    createdAt: "2026-05-19T10:35:38.426Z",
  },
  {
    name: "南海泉北線",
    folderId: "16ZmNyom3m2h0PcD9fsP6dAK2Ql-egHlZ",
    createdAt: "2026-06-06T00:48:50.098Z",
  },
  {
    name: "南海本線",
    folderId: "1alQwlJrIx-nxe6YAwUaag5YT3X2FNrn0",
    createdAt: "2026-06-06T00:49:23.505Z",
  },
];
const PHOTO_PDF_CHUNK_SIZE = 10;

const createEmptySlopeRows = (count = 10): SlopeTableRow[] =>
  Array.from({ length: count }, (_, index) => ({
    id: Date.now() + index,
    slopeType: '',
    point: '',
    place: '',
    placeSide: '',
    firstEwDirection: '',
    firstEwValue: '',
    firstNsDirection: '',
    firstNsValue: '',
    currentEwDirection: '',
    currentEwValue: '',
    currentNsDirection: '',
    currentNsValue: '',
    note: '',
    photo: null,
  }));

const formatSheetDateText = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) return `${iso[1]}/${iso[2]}/${iso[3]}`;

  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}/${m.padStart(2, '0')}/${d.padStart(2, '0')}`;
  }

  return text;
};

const normalizeDateForDateInput = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const ymd = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return text;
};

const toDisplayText = (value: unknown) =>
  value === null || value === undefined ? '' : String(value);

const getRecordText = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value);
    }
  }

  return '';
};

const normalizePhotoSrc = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return normalizePhotoSrc(
      record.url ??
      record.src ??
      record.dataUrl ??
      record.originalBase64 ??
      record.base64 ??
      record.fileId ??
      record.id
    );
  }

  const text = String(value).trim();
  if (!text) return null;
  if (text.startsWith('data:image/')) return text;
  if (/^https?:\/\//i.test(text)) {
    const fileId = text.match(/[?&]id=([^&]+)/)?.[1] || text.match(/\/d\/([^/]+)/)?.[1];
    if (fileId && /drive\.google\.com/i.test(text)) {
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
    return text;
  }
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) {
    return `https://drive.google.com/uc?export=view&id=${text}`;
  }
  if (/^iVBORw0KGgo|^\/9j\/|^R0lGOD|^UklGR/i.test(text)) {
    return `data:image/jpeg;base64,${text}`;
  }

  return text;
};

const detectImageMimeTypeFromBase64 = (base64: string) => {
  const value = base64.trim();

  if (value.startsWith("iVBORw0KGgo")) return "image/png";
  if (value.startsWith("/9j/")) return "image/jpeg";
  if (value.startsWith("R0lGOD")) return "image/gif";
  if (value.startsWith("UklGR")) return "image/webp";

  return "image/png";
};

const buildImageDataUrl = (base64: string, mimeType?: string) => {
  const value = base64.trim();
  if (value.startsWith("data:image/")) return value;

  return `data:${mimeType || detectImageMimeTypeFromBase64(value)};base64,${value}`;
};

const getScaledImageSize = (width: number, height: number, maxPixels: number) => {
  const pixels = Math.max(1, width * height);
  const scale = Math.min(1, Math.sqrt(maxPixels / pixels));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
};

const getCanvasDataUrlUnderLimit = (
  canvas: HTMLCanvasElement,
  maxBase64Length: number,
  initialQuality = 0.82
) => {
  let quality = initialQuality;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  while (dataUrl.length > maxBase64Length && quality > 0.42) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  return dataUrl;
};

const createEmptyPhotoMarkSets = (): PhotoMark[][] =>
  Array.from({ length: 4 }, () => []);

const normalizePhotoMarkColor = (value: unknown): PhotoMarkColor => {
  const color = String(value || '').trim().toLowerCase();
  if (color === 'black') return 'black';
  if (color === '#0070c0' || color === '#5372fc') return '#0070c0';
  return 'red';
};

const clampPhotoPercent = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
};

const normalizePhotoRotation = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % 360) + 360) % 360;
};

const normalizePhotoMarks = (value: unknown): PhotoMark[][] => {
  const source = Array.isArray(value) ? value : [];

  return Array.from({ length: 4 }, (_, photoIndex) => {
    const marks = Array.isArray(source[photoIndex]) ? source[photoIndex] : [];

    return marks
      .map((mark, markIndex): PhotoMark | null => {
        const record = toRecord(mark);
        const id = Number(record.id) || Date.now() + photoIndex * 1000 + markIndex;
        const color = normalizePhotoMarkColor(record.color);

        if (record.type === 'line') {
          return {
            id,
            type: 'line',
            x1: clampPhotoPercent(record.x1),
            y1: clampPhotoPercent(record.y1),
            x2: clampPhotoPercent(record.x2, 20),
            y2: clampPhotoPercent(record.y2, 20),
            color,
          };
        }

        if (record.type === 'text') {
          const text = String(record.text || '').trim();
          if (!text) return null;
          return {
            id,
            type: 'text',
            x: clampPhotoPercent(record.x),
            y: clampPhotoPercent(record.y),
            text,
            color,
          };
        }

        return {
          id,
          type: 'ellipse',
          x: clampPhotoPercent(record.x),
          y: clampPhotoPercent(record.y),
          width: Math.max(2, Math.min(100, Number(record.width) || 20)),
          height: Math.max(2, Math.min(100, Number(record.height) || 14)),
          rotation: normalizePhotoRotation(record.rotation),
          color,
        };
      })
      .filter((mark): mark is PhotoMark => Boolean(mark));
  });
};

const normalizePhotoArray = (
  data: Record<string, unknown>,
  arrayKeys: string[],
  fieldPrefixes: string[]
) => {
  const source = arrayKeys
    .map(key => data[key])
    .find(value => Array.isArray(value)) as unknown[] | undefined;

  const photos = Array(4).fill(null) as (string | null)[];

  if (source) {
    source.slice(0, 4).forEach((value, index) => {
      photos[index] = normalizePhotoSrc(value);
    });
  }

  fieldPrefixes.forEach(prefix => {
    for (let index = 0; index < 4; index += 1) {
      const fieldValue = data[`${prefix}${index + 1}`];
      const normalized = normalizePhotoSrc(fieldValue);
      if (normalized) photos[index] = normalized;
    }
  });

  return photos;
};

const normalizeMasterKey = (value: unknown) =>
  String(value || '').replace(/\s+/g, '').trim();

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const mergeUniqueMultilineText = (current: string, next: unknown) => {
  const items = [
    ...String(current || '').split(/[,\r\n]+/),
    ...String(next || '').split(/[,\r\n]+/),
  ]
    .map(value => value.trim())
    .filter(Boolean);

  return Array.from(new Set(items)).join(',　');
};


const createEmptyInspectionReportRows = (count = 23, startIndex = 0): InspectionReportRow[] =>
  Array.from({ length: count }, (_, index) => ({
    id: -(startIndex + index + 1),
    buildingName: '',
    inspectionPlace: '',
    photoNo: '',
    finishType: '',
    firstSituation: '',
    firstEval: '',
    previousYearEval: '',
    currentSituation: '',
    structEval: '',
    impactEval: '',
    totalEval: '',
  }));

const normalizeInspectionReportRow = (row: InspectionReportSourceRow, index: number): InspectionReportRow => ({
  id: Number(row.id) || index + 1,
  buildingName: toDisplayText(row.buildingName),
  inspectionPlace: toDisplayText(row.inspectionPlace),
  photoNo: toDisplayText(row.photoNo),
  finishType: toDisplayText(row.finishType),
  firstSituation: toDisplayText(row.firstSituation),
  firstEval: toDisplayText(row.firstEval || row.firstYear),
  previousYearEval: toDisplayText(row.previousYearEval),
  currentSituation: toDisplayText(row.currentSituation),
  structEval: toDisplayText(row.structEval),
  impactEval: toDisplayText(row.impactEval),
  totalEval: toDisplayText(row.totalEval),
});

const inspectionReportRowHasValue = (row: InspectionReportRow) =>
  [
    row.buildingName,
    row.inspectionPlace,
    row.photoNo,
    row.finishType,
    row.firstSituation,
    row.firstEval,
    row.previousYearEval,
    row.currentSituation,
    row.structEval,
    row.impactEval,
    row.totalEval,
  ].some(value => String(value || '').trim());

type InspectionReportSortKey = 'buildingName' | 'inspectionPlace' | 'photoNo' | 'totalEval';
type SortDirection = 'asc' | 'desc';

const compareInspectionReportText = (a: string, b: string) =>
  String(a || '').localeCompare(String(b || ''), 'ja', {
    numeric: true,
    sensitivity: 'base',
  });

const compareInspectionReportTotalEval = (a: string, b: string) => {
  const order = ['AA', 'A2', 'A1', 'B', 'C', 'S'];
  const rank = (value: string) => {
    const index = order.indexOf(String(value || '').trim());
    return index === -1 ? order.length : index;
  };

  const rankDiff = rank(a) - rank(b);
  return rankDiff || compareInspectionReportText(a, b);
};

const ROUTE_LIST_CACHE_KEY = 'station-check-route-list-v2';
const EXISTING_DATA_CACHE_PREFIX = 'station-check-existing-data-v1:';

const ROUTE_COLOR_PALETTE = [
  { button: '#2563EB', background: '#EAF2FF', text: '#FFFFFF' },
  { button: '#D99A00', background: '#FFF3CC', text: '#1F2937' },
  { button: '#16A34A', background: '#EAF8EF', text: '#FFFFFF' },
  { button: '#F97316', background: '#FFF1E6', text: '#FFFFFF' },
  { button: '#7C3AED', background: '#F2ECFF', text: '#FFFFFF' },
  { button: '#BE123C', background: '#FFE8EE', text: '#FFFFFF' },
];

const mixHexWithWhite = (hex: string, amount: number) => {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * amount)
      .toString(16)
      .padStart(2, '0');

  return `#${mix(r)}${mix(g)}${mix(b)}`;
};

const getRouteColor = (index: number) => {
  const palette = ROUTE_COLOR_PALETTE[index % ROUTE_COLOR_PALETTE.length];
  const cycle = Math.floor(index / ROUTE_COLOR_PALETTE.length);
  const softenAmount = Math.min(cycle * 0.12, 0.42);

  return {
    button: softenAmount ? mixHexWithWhite(palette.button, softenAmount) : palette.button,
    background: softenAmount ? mixHexWithWhite(palette.background, softenAmount * 0.55) : palette.background,
    text: cycle > 0 && index % ROUTE_COLOR_PALETTE.length === 1 ? '#1F2937' : palette.text,
  };
};

const getRouteIndex = (routes: RouteItem[], routeName: string, routeFolderId: string) => {
  const index = routes.findIndex(route =>
    String(route.folderId || '') === String(routeFolderId || '') ||
    String(route.name || '') === String(routeName || '')
  );

  return Math.max(index, 0);
};

const normalizeRouteList = (list: unknown): RouteItem[] =>
  Array.isArray(list)
    ? list
        .map(item => toRecord(item))
        .map(item => ({
          name: String(item.name || ''),
          folderId: String(item.folderId || ''),
          createdAt: item.createdAt ? String(item.createdAt) : undefined,
        }))
        .filter(route => route.name && route.folderId)
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : Number.POSITIVE_INFINITY;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : Number.POSITIVE_INFINITY;

          if (Number.isFinite(dateA) || Number.isFinite(dateB)) {
            return dateA - dateB || a.name.localeCompare(b.name, 'ja');
          }

          return 0;
        })
    : [];

const formatSlopeDisplayNumber = (value: unknown) => {
  const text = toDisplayText(value).trim();
  if (!text) return '';

  const number = Number(text);
  return Number.isFinite(number) ? number.toFixed(1) : text;
};

const normalizeSlopeRow = (row: Partial<SlopeTableRow>, index: number): SlopeTableRow => ({
  id: Number(row.id) || Date.now() + index,
  slopeType: toDisplayText(row.slopeType),
  point: toDisplayText(row.point),
  place: toDisplayText(row.place),
  placeSide: toDisplayText(row.placeSide),
  firstEwDirection: toDisplayText(row.firstEwDirection),
  firstEwValue: formatSlopeDisplayNumber(row.firstEwValue),
  firstNsDirection: toDisplayText(row.firstNsDirection),
  firstNsValue: formatSlopeDisplayNumber(row.firstNsValue),
  currentEwDirection: toDisplayText(row.currentEwDirection),
  currentEwValue: formatSlopeDisplayNumber(row.currentEwValue),
  currentNsDirection: toDisplayText(row.currentNsDirection),
  currentNsValue: formatSlopeDisplayNumber(row.currentNsValue),
  note: toDisplayText(row.note),
  photo1: row.photo1 ?? null,
  photo2: row.photo2 ?? null,
  pointColor: row.pointColor,
  cellStyles: row.cellStyles,
});

const padSlopeRowsForDisplay = (rows: SlopeTableRow[], inspectList: unknown[] = []) => {
  const requiredCount = Math.max(10, rows.length, inspectList.length);
  const targetCount = Math.ceil(requiredCount / 10) * 10;

  if (rows.length >= targetCount) return rows;

  return [
    ...rows,
    ...createEmptySlopeRows(targetCount - rows.length),
  ];
};

const isMissingSlopeTableError = (error: unknown) =>
  error instanceof Error && error.message.includes("傾斜表シートが見つかりません");


// 赤い波線を消すために、使用するすべてのモード名をここで定義します
type AppMode = 
  | 'menu' 
  | 'new_entry' 
  | 'exist_select' 
  | 'task_select' 
  | 'cover'
  | 'inspection_report' 
  | 'slope_table'
  | 'karte_menu' 
  | 'karte_edit' 
  | 'inclination_menu' 
  | 'inclination_edit' 
  | 'edit_list' 
  | 'editor'
  | 'route_select'
  | 'photo_number_register'
  | 'pdf_export';

const INCLINATION_CARD_WIDTH = 1152;

// components/TaskSelect.tsx
export default function InspectorApp() {
  const fileInputs = useRef<(HTMLInputElement | null)[]>([]);
  const firstFileInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [viewportWidth, setViewportWidth] = useState(INCLINATION_CARD_WIDTH);

  // 追加の入力項目用ステート
  const [structEval, setStructEval] = useState('');    // ① 構造度評価 (F3)
  const [impactEval, setImpactEval] = useState('');    // ② 影響評価 (I3)
  const [totalEval, setTotalEval] = useState('');     // 総合評価 (L3)
  const [prevYearEval, setPrevYearEval] = useState(''); // 前年度評価 (Q3)
  const [firstKarteNo, setFirstKarteNo] = useState(''); // 初回カルテ番号 (D8)
  const [firstDate, setFirstDate] = useState('');      // 初回点検日 (F5)
  const [photoKarteMasterDates, setPhotoKarteMasterDates] = useState({
    firstDates: [] as string[],
    inspectDate: '',
  });
  const [photoKarteStoredFirstDate, setPhotoKarteStoredFirstDate] = useState('');
  const [firstInspector, setFirstInspector] = useState(''); // 初回点検者 (F6)
  const [photoKarteStoredFirstInspector, setPhotoKarteStoredFirstInspector] = useState('');
  const [photoKarteSelectedInspector, setPhotoKarteSelectedInspector] = useState('');
  const [firstFinish, setFirstFinish] = useState(''); // 初回 仕上げ材
  const [firstSituation, setFirstSituation] = useState(''); // 初回 状況
  const [firstDetail, setFirstDetail] = useState(''); // 初回 サイズ詳細
  const [slopeFirstContractor, setSlopeFirstContractor] = useState('');
  const [slopeFirstInspector, setSlopeFirstInspector] = useState('');

  // --- 共通ステート ---
  const [routeList, setRouteList] = useState<RouteItem[]>([]);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [mode, setMode] = useState<AppMode>('menu');
  const [history, setHistory] = useState<AppMode[]>([]);
  const [isLoading, setIsLoading] = useState(false); // ★ これを関数の上に持ってくる
  const [stationNo, setStationNo] = useState("");
  const [stationName, setStationName] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [routeFolderId, setRouteFolderId] = useState('');
  const [stationFolderId, setStationFolderId] = useState('');
  const [existingData, setExistingData] = useState<ExistingStation[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isMergingPdfs, setIsMergingPdfs] = useState(false);
  const [activePlaceRowId, setActivePlaceRowId] = useState<number | null>(null);
  // 長押し判定や移動状態を保持するRef
  const dragRef = useRef<{
  timer: NodeJS.Timeout | null;
  isMoved: boolean;
  startX: number;
  startY: number;
}>({ timer: null, isMoved: false, startX: 0, startY: 0 });

//新規駅登録画面に入った瞬間にリセット
useEffect(() => {
  if (mode === 'new_entry') {
    resetAllState();
  }
}, [mode]);

useEffect(() => {
  const updateViewportWidth = () => setViewportWidth(window.innerWidth);

  updateViewportWidth();
  window.addEventListener('resize', updateViewportWidth);
  window.addEventListener('orientationchange', updateViewportWidth);

  return () => {
    window.removeEventListener('resize', updateViewportWidth);
    window.removeEventListener('orientationchange', updateViewportWidth);
  };
}, []);

  // --- 修正・編集用ステート ---
  const [existingKartes, setExistingKartes] = useState<string[]>([]);
  const [completedPhotoKartes, setCompletedPhotoKartes] = useState<Set<string>>(() => new Set());
  const [unsavedPhotoKartes, setUnsavedPhotoKartes] = useState<UnsavedPhotoKarte[]>([]);
  const [availableKarteNumbers, setAvailableKarteNumbers] = useState<string[]>([]);
  const [unavailableKarteNumbers, setUnavailableKarteNumbers] = useState<string[]>([]);
  const [registerKarteNo, setRegisterKarteNo] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  
  // --- 位置図エディタ用ステート ---
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [driveMaps, setDriveMaps] = useState<DriveMapItem[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolderItem[]>([]);
  const [driveCurrentFolder, setDriveCurrentFolder] = useState<DriveFolderItem | null>(null);
  const [driveParentFolder, setDriveParentFolder] = useState<DriveFolderItem | null>(null);
  const [driveFolderPath, setDriveFolderPath] = useState('');
  const [drivePickerTarget, setDrivePickerTarget] = useState<DrivePickerTarget>({ type: 'map' });
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [mapImageAspect, setMapImageAspect] = useState(4 / 3);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [mapTexts, setMapTexts] = useState<MapTextAnnotation[]>([]);
  const [mapLines, setMapLines] = useState<MapLineAnnotation[]>([]);
  const [draggingMarkerId, setDraggingMarkerId] = useState<number | null>(null);
  const [draggingTextId, setDraggingTextId] = useState<number | null>(null);
  const [draggingLineHandle, setDraggingLineHandle] = useState<{ id: number; endpoint: 'start' | 'end' } | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingMarker, setEditingMarker] = useState<Marker | null>(null);
  const [editingText, setEditingText] = useState<MapTextAnnotation | null>(null);
  const [editingLine, setEditingLine] = useState<MapLineAnnotation | null>(null);
  const [tempPos, setTempPos] = useState({ x: 0, y: 0 });
  const [formMode, setFormMode] = useState<MapAddMode>('marker');
  const [formLabel, setFormLabel] = useState('1');
  const [formText, setFormText] = useState('');
  const [formColor, setFormColor] = useState<MapColor>('red');
  const [formShape, setFormShape] = useState<'circle' | 'square'>('circle');
  const imageRef = useRef<HTMLImageElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const photoEditorImageRef = useRef<HTMLImageElement>(null);
  const [firstPhotoMarks, setFirstPhotoMarks] = useState<PhotoMark[][]>(() => createEmptyPhotoMarkSets());
  const [currentPhotoMarks, setCurrentPhotoMarks] = useState<PhotoMark[][]>(() => createEmptyPhotoMarkSets());
  const [photoEditorTarget, setPhotoEditorTarget] = useState<PhotoEditorTarget | null>(null);
  const [photoMarkTool, setPhotoMarkTool] = useState<PhotoMarkTool>('ellipse');
  const [photoMarkColor, setPhotoMarkColor] = useState<PhotoMarkColor>('red');
  const [editingPhotoMark, setEditingPhotoMark] = useState<PhotoMark | null>(null);
  const [photoMarkText, setPhotoMarkText] = useState('');
  const photoMarkDragRef = useRef<{
    id: number | null;
    mode: 'move' | 'resize' | 'rotate' | 'line-start' | 'line-end' | null;
    corner?: 'nw' | 'ne' | 'sw' | 'se';
    lastX: number;
    lastY: number;
  }>({ id: null, mode: null, lastX: 0, lastY: 0 });
  const textDragRef = useRef<{ id: number | null; lastX: number; lastY: number; isMoved: boolean }>({
    id: null,
    lastX: 0,
    lastY: 0,
    isMoved: false,
  });
  const [mapDisplaySize, setMapDisplaySize] = useState({ width: 0, height: 0 });

  // --- カルテ・傾斜共通入力用ステート ---
  const [karteNo, setKarteNo] = useState('1');
  const [inspectDate, setInspectDate] = useState('');
  const [contractor, setContractor] = useState('');
  const [inspector, setInspector] = useState('');
  const [buildingCategory, setBuildingCategory] = useState('');
  const [inspectionPlace, setInspectionPlace] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [buildingCategoryOptions, setBuildingCategoryOptions] = useState<string[]>([]);
  const [inspectionPlaceOptions, setInspectionPlaceOptions] = useState<string[]>([]);
  const [finishOptionsByPlace, setFinishOptionsByPlace] = useState<Record<string, string[]>>({});
  const [checkItemsByPlace, setCheckItemsByPlace] = useState<Record<string, string[][]>>({});
  const [inspectorRegistrations, setInspectorRegistrations] = useState<InspectorRegistration[]>([]);
  const [inspectorOptions, setInspectorOptions] = useState<string[]>([]);
  const [showCheckPanel, setShowCheckPanel] = useState(false);
  const [remarks1, setRemarks1] = useState('');
  const [remarks2, setRemarks2] = useState('');
  const [remarks3, setRemarks3] = useState('');
  const [photos, setPhotos] = useState<(string | null)[]>(Array(4).fill(null));
  const [firstPhotos, setFirstPhotos] = useState<(string | null)[]>(Array(4).fill(null));
  const [pdfSheets, setPdfSheets] = useState<PdfSheetGroups>({ cover: [], photo: [], photoPositionMap: [], slope: [], inclination: [], inspectionReport: [] });
  const [selectedPdfSheets, setSelectedPdfSheets] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [slopeRows, setSlopeRows] = useState<SlopeTableRow[]>(() => createEmptySlopeRows());
  const [evalType, setEvalType] = useState('');
  const [inspectList, setInspectList] = useState<string[]>([]);
  const [inclinationPageIndex, setInclinationPageIndex] = useState(0);
  const [inspectionReportRows, setInspectionReportRows] = useState<InspectionReportRow[]>(() => createEmptyInspectionReportRows());
  const [inspectionReportSort, setInspectionReportSort] = useState<{
    key: InspectionReportSortKey | null;
    direction: SortDirection;
  }>({ key: null, direction: 'asc' });
  const [coverDateStatus, setCoverDateStatus] = useState('');
  const pulldownListsLoadedRef = useRef(false);
  const existingDataLoadedRouteRef = useRef('');
  const routesLoadedRef = useRef(false);
  const routesLoadingRef = useRef(false);
  const inspectionReportLoadIdRef = useRef(0);
  const createNewInFlightRef = useRef(false);

const updateMapDisplaySize = useCallback(() => {
  const stage = mapStageRef.current;
  const image = imageRef.current;
  if (!stage || !image || !image.naturalWidth || !image.naturalHeight) return;

  const stageRect = stage.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return;

  const ratio = Math.min(
    stageRect.width / image.naturalWidth,
    stageRect.height / image.naturalHeight
  );
  const nextWidth = Math.round(image.naturalWidth * ratio);
  const nextHeight = Math.round(image.naturalHeight * ratio);

  setMapDisplaySize(prev =>
    prev.width === nextWidth && prev.height === nextHeight
      ? prev
      : { width: nextWidth, height: nextHeight }
  );
}, []);

useEffect(() => {
  if (!finalImage) {
    setMapDisplaySize({ width: 0, height: 0 });
    return;
  }

  updateMapDisplaySize();

  const stage = mapStageRef.current;
  if (!stage || typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', updateMapDisplaySize);
    return () => window.removeEventListener('resize', updateMapDisplaySize);
  }

  const observer = new ResizeObserver(updateMapDisplaySize);
  observer.observe(stage);
  window.addEventListener('resize', updateMapDisplaySize);

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', updateMapDisplaySize);
  };
}, [finalImage, updateMapDisplaySize]);

const getInspectionReportEvalClass = (
  field: keyof Omit<InspectionReportRow, 'id'>,
  value: string
) => {
  const text = String(value || '').trim();

  if (field === 'previousYearEval' || field === 'totalEval') {
    return isInspectionReportRedEval(text) ? 'text-red-600 font-black' : 'text-black';
  }

  return 'text-black';
};

const isInspectionReportRedEval = (value: unknown) => {
  const text = String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toUpperCase();
  return ['AA', 'A1', 'A2', 'B'].includes(text);
};

const renderInspectionReportCellValue = (
  field: keyof Omit<InspectionReportRow, 'id'>,
  value: string
) => {
  return value;
};

const getEvalFontColor = (field: 'structEval' | 'totalEval', value: unknown) => {
  const text = String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (field === 'totalEval' && isInspectionReportRedEval(text)) {
    return '#dc2626';
  }

  return '#000000';
};

const updateInspectionReportRow = (
  rowId: number,
  field: keyof Omit<InspectionReportRow, 'id'>,
  value: string
) => {
  setInspectionReportRows(rows =>
    rows.map(row =>
      row.id === rowId ? { ...row, [field]: value } : row
    )
  );
};
const sortInspectionReportRows = (key: InspectionReportSortKey) => {
  const direction: SortDirection =
    inspectionReportSort.key === key && inspectionReportSort.direction === 'asc'
      ? 'desc'
      : 'asc';

  setInspectionReportRows(rows => {
    const filledRows = rows.filter(inspectionReportRowHasValue);
    const emptyRows = rows.filter(row => !inspectionReportRowHasValue(row));

    const sortedRows = filledRows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const result =
          key === 'totalEval'
            ? compareInspectionReportTotalEval(a.row.totalEval, b.row.totalEval)
            : compareInspectionReportText(a.row[key], b.row[key]);

        const directedResult = direction === 'asc' ? result : -result;
        return directedResult || a.index - b.index;
      })
      .map(item => item.row);

    return [...sortedRows, ...emptyRows];
  });

  setInspectionReportSort({ key, direction });
};
const getInspectionReportSortIcon = (key: InspectionReportSortKey) => {
  if (inspectionReportSort.key !== key) return '↕';
  return inspectionReportSort.direction === 'asc' ? '↑' : '↓';
};
const loadRoutes = useCallback(async () => {
  if (routesLoadedRef.current) return;
  if (routesLoadingRef.current) return;
  let hasUsableCache = false;

  try {
    const cached = window.localStorage.getItem(ROUTE_LIST_CACHE_KEY);
    if (cached) {
      const list = normalizeRouteList(JSON.parse(cached));
      if (list.length > 0) {
        setRouteList(list);
        hasUsableCache = true;
      }
    }
  } catch {
    // キャッシュが壊れていてもGASから再取得する
  }

  if (!hasUsableCache && DEFAULT_ROUTE_LIST.length > 0) {
    setRouteList(DEFAULT_ROUTE_LIST);
    hasUsableCache = true;
  }

  try {
    routesLoadingRef.current = true;

    const result = await gasApi("getRouteList");

    if (result.success) {

      const list = normalizeRouteList(result.list);
      setRouteList(list);
      window.localStorage.setItem(ROUTE_LIST_CACHE_KEY, JSON.stringify(list));
      routesLoadedRef.current = true;

    }

  } catch (e) {

    console.error(e);
    if (!hasUsableCache) {
      alert(`路線一覧の読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }

  } finally {

    routesLoadingRef.current = false;

  }

}, []);

// --- 初期化 ---
  const refreshData = useCallback(async (force = false) => {
  if (!routeFolderId) return [];
  if (!force && existingDataLoadedRouteRef.current === routeFolderId) return existingData;

  const cacheKey = `${EXISTING_DATA_CACHE_PREFIX}${routeFolderId}`;
  let cachedList: ExistingStation[] = [];

  if (!force) {
    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedList = parsed as ExistingStation[];
          setExistingData(cachedList);
          existingDataLoadedRouteRef.current = routeFolderId;
        }
      }
    } catch {
      // キャッシュが壊れていてもGASから再取得する
    }
  }

  if (cachedList.length === 0) {
    setIsLoading(true);
  }

  try {
    const result = await gasApi("getExistingData", {
      routeFolderId,
    });

    if (result.success && Array.isArray(result.list)) {
      setExistingData(result.list);
      window.localStorage.setItem(cacheKey, JSON.stringify(result.list));
      existingDataLoadedRouteRef.current = routeFolderId;
      return result.list as ExistingStation[];
    } else {
      setExistingData([]);
      existingDataLoadedRouteRef.current = routeFolderId;
      return [];
    }
  } catch (e) {
    console.error(e);
    if (cachedList.length > 0) {
      return cachedList;
    }
    setExistingData([]);
    alert(`駅一覧の読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  } finally {
    setIsLoading(false);
  }
}, [existingData, routeFolderId]);

const fetchInspectionListDates = useCallback(async () => {
  if (!selectedRoute || !stationName || !selectedYear) return null;

  const result = await gasApi("getInspectionListDates", {
      masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
      routeName: selectedRoute,
      station: stationName,
      year: selectedYear,
    });
  const firstDates: string[] = Array.isArray(result.firstDates)
    ? Array.from(new Set<string>(
        result.firstDates
          .map((value: unknown) => String(value || '').trim())
          .filter((value: string) => Boolean(value))
      ))
    : String(result.firstDate || '').trim()
      ? [String(result.firstDate).trim()]
      : [];

  return {
    stationNo: String(result.stationNo || '').trim(),
    firstDate: String(result.firstDate ?? ''),
    firstDates,
    inspectDate: String(result.latestDate ?? ''),
    message: String(result.message || ''),
  };
}, [selectedRoute, stationName, selectedYear]);

const applyInspectionListDates = useCallback((dates: {
  stationNo?: string;
  firstDate?: string;
  inspectDate?: string;
} | null) => {
  if (!dates) return;
  if (dates.firstDate !== undefined) setFirstDate(dates.firstDate);
  if (dates.inspectDate !== undefined) setInspectDate(dates.inspectDate);
  if (dates.stationNo) setStationNo(dates.stationNo);
}, []);

const loadInspectionListDates = useCallback(async () => {
  try {
    const result = await fetchInspectionListDates();
    applyInspectionListDates(result);
  } catch (e) {
    console.warn("点検リスト_マスタの日付取得に失敗しました", e);
  }
}, [fetchInspectionListDates, applyInspectionListDates]);

const loadPhotoKarteMasterDates = useCallback(async () => {
  try {
    const result = await fetchInspectionListDates();
    if (!result) return;

    setPhotoKarteMasterDates({
      firstDates: result.firstDates,
      inspectDate: result.inspectDate || '',
    });
    if (result.stationNo) setStationNo(result.stationNo);
  } catch (e) {
    console.warn("写真カルテ用の日付取得に失敗しました", e);
  }
}, [fetchInspectionListDates]);

const loadCoverInspectionDate = useCallback(async () => {
  if (!selectedRoute || !stationName || !selectedYear) {
    setCoverDateStatus("路線・駅名・年度を選択してください");
    return;
  }

  setCoverDateStatus("調査日を読み込み中...");

  try {
    const result = await fetchInspectionListDates();
    if (!result) return;

    applyInspectionListDates(result);
    const nextInspectDate = result.inspectDate;

    if (nextInspectDate) {
      setCoverDateStatus("");
    } else {
      setCoverDateStatus(String(result.message || "選択年度の調査日が見つかりません"));
    }
  } catch (e) {
    console.error(e);
    setCoverDateStatus(`調査日の読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  }
}, [selectedRoute, stationName, selectedYear, fetchInspectionListDates, applyInspectionListDates]);

const loadPulldownLists = useCallback(async () => {
  if (pulldownListsLoadedRef.current) return;

  try {
    const result = await gasApi("getPulldownLists");

    if (result.success) {
      setBuildingCategoryOptions(
        Array.isArray(result.buildingCategories) ? result.buildingCategories : []
      );
      setInspectionPlaceOptions(
        Array.isArray(result.inspectionPlaces) ? result.inspectionPlaces : []
      );
      setFinishOptionsByPlace(
        result.finishOptionsByPlace && typeof result.finishOptionsByPlace === "object"
          ? result.finishOptionsByPlace
          : {}
      );
      setCheckItemsByPlace(
        result.checkItemsByPlace && typeof result.checkItemsByPlace === "object"
          ? result.checkItemsByPlace
          : {}
      );
      setInspectorRegistrations(
        Array.isArray(result.inspectorRegistrations)
          ? result.inspectorRegistrations.map((item: unknown) => {
              const record = toRecord(item);
              return {
                routeName: String(record.routeName || ''),
                year: String(record.year || ''),
                contractor: String(record.contractor || ''),
                inspectors: Array.isArray(record.inspectors)
                  ? record.inspectors.map((name: unknown) => String(name || '').trim()).filter(Boolean)
                  : [],
              };
            })
          : []
      );

      pulldownListsLoadedRef.current = true;
    }
  } catch (e) {
    console.error(e);
  }
}, []);


useEffect(() => {
  loadRoutes();
}, [loadRoutes]);

useEffect(() => {
  if (mode === 'karte_edit' || mode === 'slope_table' || mode === 'inclination_menu' || mode === 'inclination_edit') {
    loadPulldownLists();
  }
}, [mode, loadPulldownLists]);

useEffect(() => {
  if (mode === 'inspection_report') return;

  if (!selectedRoute || !selectedYear) {
    setInspectorOptions([]);
    setContractor('');
    setInspector('');
    return;
  }

  const registration = inspectorRegistrations.find(item =>
    normalizeMasterKey(item.routeName) === normalizeMasterKey(selectedRoute) &&
    String(item.year).trim() === String(selectedYear).trim()
  );

  if (!registration) {
    setInspectorOptions([]);
    setContractor('');
    setInspector('');
    return;
  }

  setInspectorOptions(registration.inspectors);
  setContractor(registration.contractor);

  setInspector(current => {
    if (registration.inspectors.includes(current)) return current;
    return registration.inspectors[0] || current || '';
  });
}, [inspectorRegistrations, selectedRoute, selectedYear, mode]);

  // ★ここに入れる
useEffect(() => {
  if (mode === 'exist_select') {
    refreshData();
  }
}, [mode, refreshData]);

useEffect(() => {
  if (mode === 'photo_number_register' && spreadsheetId) {
    loadKarteNumberOptions().catch(e => console.error(e));
  }
}, [mode, spreadsheetId]);

useEffect(() => {
  if (mode === 'editor' && spreadsheetId && !sourceImage && !finalImage) {
    loadSavedMapEditorData(true).catch(e => console.error(e));
  }
}, [mode, spreadsheetId]);

useEffect(() => {
  if (mode === 'pdf_export' && spreadsheetId) {
    loadPdfSheetOptions().catch(e => console.error(e));
  }
}, [mode, spreadsheetId]);

useEffect(() => {
  if (mode === 'cover') {
    loadCoverInspectionDate().catch(e => console.error(e));
  }
}, [mode, loadCoverInspectionDate]);

useEffect(() => {
  if (mode === 'inspection_report' && spreadsheetId) {
    loadInspectionReport().catch(e => console.error(e));
  }
}, [mode, spreadsheetId, selectedRoute, stationName, selectedYear]);

useEffect(() => {
  setShowCheckPanel(false);
}, [inspectionPlace]);

useEffect(() => {
  if (mode === 'karte_edit') {
    loadPhotoKarteMasterDates();
    return;
  }

  if (mode === 'slope_table' || mode === 'inclination_menu') {
    loadInspectionListDates();
  }
}, [mode, loadInspectionListDates, loadPhotoKarteMasterDates]);

useEffect(() => {
  if (mode !== 'karte_edit') return;

  const hasCurrentPhoto = photos.some(photo => Boolean(photo));
  setFirstDate(
    hasCurrentPhoto
      ? photoKarteStoredFirstDate || photoKarteMasterDates.firstDates[0] || ''
      : photoKarteMasterDates.inspectDate
  );
  setInspectDate(hasCurrentPhoto ? photoKarteMasterDates.inspectDate : '');
}, [mode, photos, photoKarteMasterDates, photoKarteStoredFirstDate]);

useEffect(() => {
  if (mode !== 'karte_edit') return;

  setPhotoKarteSelectedInspector(current => {
    if (current && inspectorOptions.includes(current)) return current;
    if (inspector && inspectorOptions.includes(inspector)) return inspector;
    return inspectorOptions[0] || '';
  });
}, [mode, inspector, inspectorOptions]);

useEffect(() => {

  if (mode !== 'slope_table' && mode !== 'inclination_menu') return;
  if (!spreadsheetId) return;

  loadSlopeTable();

}, [mode, spreadsheetId]);

useEffect(() => {
  setInclinationPageIndex(0);
}, [mode, spreadsheetId]);

useEffect(() => {
  if (!spreadsheetId || typeof window === 'undefined') {
    setCompletedPhotoKartes(new Set());
    return;
  }

  try {
    const saved = window.localStorage.getItem(`station-check:photo-karte-completed:${spreadsheetId}`);
    const list = saved ? JSON.parse(saved) : [];
    setCompletedPhotoKartes(new Set(Array.isArray(list) ? list.map(no => String(no)) : []));
  } catch (e) {
    console.error(e);
    setCompletedPhotoKartes(new Set());
  }
}, [spreadsheetId]);

useEffect(() => {
  if (!spreadsheetId) {
    setUnsavedPhotoKartes([]);
    return;
  }

  getUnsavedPhotoKartesFromDb(spreadsheetId)
    .then(setUnsavedPhotoKartes)
    .catch(e => {
      console.error(e);
      setUnsavedPhotoKartes([]);
    });
}, [spreadsheetId]);

const refreshUnsavedPhotoKartes = async () => {
  if (!spreadsheetId) {
    setUnsavedPhotoKartes([]);
    return [];
  }

  const rows = await getUnsavedPhotoKartesFromDb(spreadsheetId);
  setUnsavedPhotoKartes(rows);
  return rows;
};

const saveCompletedPhotoKartes = (next: Set<string>) => {
  if (!spreadsheetId || typeof window === 'undefined') return;
  window.localStorage.setItem(
    `station-check:photo-karte-completed:${spreadsheetId}`,
    JSON.stringify([...next].sort((a, b) => Number(a) - Number(b)))
  );
};

const toggleCurrentPhotoKarteComplete = () => {
  const no = String(karteNo || '').trim();
  if (!no) return alert("写真カルテ番号がありません");

  setCompletedPhotoKartes(prev => {
    const next = new Set(prev);

    if (next.has(no)) {
      next.delete(no);
    } else {
      next.add(no);
    }

    saveCompletedPhotoKartes(next);
    return next;
  });
};

const isPhotoKarteComplete = (no: string | number) =>
  completedPhotoKartes.has(String(no).trim());

const unsavedPhotoKarteNumbers = new Set(unsavedPhotoKartes.map(item => String(item.karteNo)));
const unsavedPhotoKarteCount = unsavedPhotoKartes.length;
const remainingUnsavedPhotoKarteCount = Math.max(0, UNSAVED_PHOTO_KARTE_LIMIT - unsavedPhotoKarteCount);

  // 駅や年度が変わったら入力をクリア
  useEffect(() => {
  if (mode === 'new_entry' || mode === 'karte_edit' || mode === 'inclination_edit') return;

  setSourceImage(null);
  setFinalImage(null);
  setMarkers([]); 
  setPhotos(Array(4).fill(null));
  setFirstPhotos(Array(4).fill(null));
  setCurrentPhotoMarks(createEmptyPhotoMarkSets());
  setFirstPhotoMarks(createEmptyPhotoMarkSets());
  setSlopeRows(createEmptySlopeRows());

  setKarteNo('1');
  setInspectDate('');
  setBuildingCategory('');
  setInspectionPlace('');
  setLocationDetail('');

  setRemarks1('');
  setRemarks2('');
  setRemarks3('');

  // ★追加ここから
  const matched = existingData.find(
    d =>
      d.stationName === stationName &&
      String(d.year) === String(selectedYear) &&
      String(d.routeFolderId) === String(routeFolderId)
  );

  setStationNo(String(matched?.stationNo || ''));
  // ★追加ここまで

}, [stationName, selectedYear, existingData, routeFolderId, mode]);

// 総合評価 自動判定
useEffect(() => {

  const table: Record<string, string> = {

    "AA_〇": "AA",
    "AA_△": "AA",
    "AA_☓": "A1",

    "A1_〇": "AA",
    "A1_△": "A1",
    "A1_☓": "A2",

    "A2_〇": "A1",
    "A2_△": "A2",
    "A2_☓": "A2",

    "B_〇": "B",
    "B_△": "B",
    "B_☓": "C",

    "C_〇": "B",
    "C_△": "C",
    "C_☓": "S",

    "S_〇": "C",
    "S_△": "S",
    "S_☓": "S",
  };

  const key = `${structEval}_${impactEval}`;

  setTotalEval(table[key] || '');

}, [structEval, impactEval]);

const handleCreateNewSheet = async () => {
  if (createNewInFlightRef.current || isLoading) return;
  if (!stationNo || !stationName || !selectedYear) return alert("駅番号、駅名、年度を入力してください");

  const currentExistingData =
    existingDataLoadedRouteRef.current === routeFolderId
      ? existingData
      : await refreshData();

  const duplicate = currentExistingData.find(
    d =>
      d.stationName === stationName &&
      String(d.year) === String(selectedYear) &&
      String(d.routeFolderId) === String(routeFolderId)
  );

  if (duplicate) {
    if (!duplicate.spreadsheetId) {
      alert("既存データのスプレッドシートIDが見つかりません");
      return;
    }

    if (confirm(`「${stationName}」の${selectedYear}年度は既に存在します。既存のデータを編集しますか？`)) {
      setSpreadsheetId(duplicate.spreadsheetId);
      setStationFolderId(duplicate.folderId || '');
      setStationNo(String(duplicate.stationNo || ''));

      goTo('task_select');
      return;

    } else {
      return;
    }
  }

  // 重複がなければ新規作成実行
  createNewInFlightRef.current = true;
  setIsLoading(true);

  try {

    const result = await gasApi("createNew", {
      routeFolderId: routeFolderId,
      routeName: selectedRoute,
      stationNo: stationNo,
      station: stationName,
      year: selectedYear
    });

    if (result.success) {
      try {
        await gasApi("updateInspectionListMasterStation", {
          masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
          routeName: selectedRoute,
          stationNo,
          station: stationName,
          year: selectedYear,
        });
      } catch (e) {
        console.error(e);
        alert(`点検リスト_マスタへの反映に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      }

      setSpreadsheetId(result.spreadsheetId);
      setStationFolderId(result.folderId);

      goTo('task_select');
    }

  } catch (e) {

    alert("作成に失敗しました");

  } finally {

    createNewInFlightRef.current = false;
    setIsLoading(false);

  }
};

  // 写真撮影ハンドラ
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  try {
    const compressed = await resizePhotoFile(file);

    const newPhotos = [...photos];
    newPhotos[index] = compressed;
    setPhotos(newPhotos);
    setCurrentPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
  } catch (error) {
    alert(
      "写真を読み込めませんでした。JPEG、PNG、HEIC/HEIF形式の写真を選択してください。" +
      (error instanceof Error ? `\n${error.message}` : "")
    );
  }
};

  const handleFirstCapture = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;

  try {
    const compressed = await resizePhotoFile(file);

    const newPhotos = [...firstPhotos];
    newPhotos[index] = compressed;
    setFirstPhotos(newPhotos);
    setFirstPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
  } catch (error) {
    alert(
      "写真を読み込めませんでした。JPEG、PNG、HEIC/HEIF形式の写真を選択してください。" +
      (error instanceof Error ? `\n${error.message}` : "")
    );
  }
};

  const isHeicFile = (file: File) =>
    /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

  const isHeicBlob = async (blob: Blob) => {
    const header = await blob.slice(0, 32).arrayBuffer();
    const text = Array.from(new Uint8Array(header))
      .map(byte => String.fromCharCode(byte))
      .join("");

    return /ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/i.test(text);
  };

  const isHeicDataUrl = (dataUrl: string) =>
    /^data:image\/hei[cf][;,]/i.test(dataUrl) ||
    /^data:application\/octet-stream[;,]/i.test(dataUrl);

  const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("写真ファイルの読み込みに失敗しました"));
      reader.readAsDataURL(blob);
    });

  const readPhotoFileAsDataUrl = async (file: File): Promise<string> => {
    if (isHeicFile(file) || await isHeicBlob(file)) {
      return convertHeicBlobToJpegDataUrl(file);
    }

    return convertHeicDataUrlToJpegIfNeeded(await readBlobAsDataUrl(file));
  };

  const resizePhotoFile = async (
    file: File,
    maxSize = 900,
    maxBytes = 1000000,
    minQuality = 0.3,
    maxPixels = 1000000
  ) => {
    const dataUrl = await readPhotoFileAsDataUrl(file);

    try {
      return await resizeImage(dataUrl, maxSize, maxBytes, minQuality, maxPixels);
    } catch (error) {
      try {
        const converted = await convertHeicBlobToJpegDataUrl(file);
        return await resizeImage(converted, maxSize, maxBytes, minQuality, maxPixels);
      } catch (_) {
        throw error;
      }
    }
  };

  const convertHeicBlobToJpegDataUrl = async (blob: Blob): Promise<string> => {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({
      blob,
      toType: "image/jpeg",
      quality: 0.85,
    });
    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

    if (!convertedBlob) {
      throw new Error("HEIC/HEIF写真をJPEGに変換できませんでした");
    }

    return readBlobAsDataUrl(convertedBlob);
  };

  const convertHeicDataUrlToJpegIfNeeded = async (dataUrl: string): Promise<string> => {
    if (!isHeicDataUrl(dataUrl)) return dataUrl;

    const response = await fetch(dataUrl);
    return convertHeicBlobToJpegDataUrl(await response.blob());
  };

  const resizeImageWithHeicFallback = async (
    dataUrl: string,
    maxSize = 900,
    maxBytes = 1000000,
    minQuality = 0.3,
    maxPixels = 1000000
  ) => {
    try {
      return await resizeImage(dataUrl, maxSize, maxBytes, minQuality, maxPixels);
    } catch (error) {
      try {
        const response = await fetch(dataUrl);
        const converted = await convertHeicBlobToJpegDataUrl(await response.blob());
        return await resizeImage(converted, maxSize, maxBytes, minQuality, maxPixels);
      } catch (_) {
        throw error;
      }
    }
  };

  const resizeImage = async (
    base64Str: string,
    maxSize = 900,
    maxBytes = 1000000,
    minQuality = 0.3,
    maxPixels = 1000000
  ): Promise<string> => {

  return new Promise((resolve, reject) => {

    const img = new Image();

    img.onload = () => {

      let width = img.width;
      let height = img.height;

      if (width > height && width > maxSize) {
        height = height * (maxSize / width);
        width = maxSize;
      } 
      else if (height > maxSize) {
        width = width * (maxSize / height);
        height = maxSize;
      }

      if (width * height > maxPixels) {
        const pixelScale = Math.sqrt(maxPixels / (width * height));
        width = width * pixelScale;
        height = height * pixelScale;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(width);
      canvas.height = Math.floor(height);

      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);

      let quality = 0.6;
      let result = canvas.toDataURL("image/jpeg", quality);

      while (result.length > maxBytes && quality > minQuality) {
        quality -= 0.05;
        result = canvas.toDataURL("image/jpeg", quality);
      }

      resolve(result);
    };

    img.onerror = () => {
      reject(new Error("この画像形式はブラウザで表示できません"));
    };

    img.src = base64Str;

  });

};

  const loadImageElement = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("写真を読み込めませんでした"));
      img.src = src;
    });

  const drawPhotoMarks = (
    ctx: CanvasRenderingContext2D,
    marks: PhotoMark[],
    width: number,
    height: number,
    scale = 1
  ) => {
    marks.forEach(mark => {
      ctx.strokeStyle = mark.color;
      ctx.fillStyle = mark.color;
      ctx.lineWidth = Math.max(4, Math.round(5 * scale));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (mark.type === 'ellipse') {
        const x = (mark.x / 100) * width;
        const y = (mark.y / 100) * height;
        const radiusX = Math.max(4, (mark.width / 100) * width / 2);
        const radiusY = Math.max(4, (mark.height / 100) * height / 2);
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, radiusY, (mark.rotation * Math.PI) / 180, 0, Math.PI * 2);
        ctx.stroke();
      } else if (mark.type === 'line') {
        ctx.beginPath();
        ctx.moveTo((mark.x1 / 100) * width, (mark.y1 / 100) * height);
        ctx.lineTo((mark.x2 / 100) * width, (mark.y2 / 100) * height);
        ctx.stroke();
      } else {
        const fontSize = Math.max(22, Math.round(30 * scale));
        ctx.font = `bold ${fontSize}px "MS Gothic", "ＭＳ ゴシック", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        mark.text.split(/\r?\n/).forEach((line, index) => {
          ctx.fillText(line, (mark.x / 100) * width, (mark.y / 100) * height + index * fontSize * 1.25);
        });
      }
    });
  };

  const renderPhotoForSave = async (photo: string, marks: PhotoMark[]) => {
    const base = marks.length ? photo : await resizeImage(photo);
    if (!marks.length) return base;

    const img = await loadImageElement(photo);
    const outputSize = getScaledImageSize(img.naturalWidth, img.naturalHeight, 2500000);
    const canvas = document.createElement('canvas');
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("写真の注釈処理を開始できません");

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    drawPhotoMarks(ctx, marks, canvas.width, canvas.height, outputSize.scale);

    return getCanvasDataUrlUnderLimit(canvas, 2400000, 0.9);
  };

  const getPhotoMarks = (target: PhotoEditorTarget) =>
    target.target === 'first'
      ? firstPhotoMarks[target.index] || []
      : currentPhotoMarks[target.index] || [];

  const setPhotoMarksForTarget = (target: PhotoEditorTarget, updater: (marks: PhotoMark[]) => PhotoMark[]) => {
    const setMarks = target.target === 'first' ? setFirstPhotoMarks : setCurrentPhotoMarks;
    setMarks(prev => prev.map((marks, index) => index === target.index ? updater(marks) : marks));
  };

  const openPhotoMarkEditor = (target: PhotoMarkTarget, index: number) => {
    setPhotoEditorTarget({ target, index });
    setEditingPhotoMark(null);
    setPhotoMarkText('');
    setPhotoMarkTool('ellipse');
  };

  const updatePhotoMark = (mark: PhotoMark) => {
    if (!photoEditorTarget) return;
    setPhotoMarksForTarget(photoEditorTarget, marks =>
      marks.map(item => item.id === mark.id ? mark : item)
    );
  };

  const deletePhotoMark = (markId: number) => {
    if (!photoEditorTarget) return;
    setPhotoMarksForTarget(photoEditorTarget, marks => marks.filter(mark => mark.id !== markId));
    setEditingPhotoMark(null);
  };

  const addPhotoMarkAt = (x: number, y: number) => {
    if (!photoEditorTarget) return;
    const id = Date.now();

    if (photoMarkTool === 'text') {
      const text = window.prompt("入れる文字を入力してください", photoMarkText || "");
      if (!text?.trim()) return;
      const nextMark: PhotoTextMark = { id, type: 'text', x, y, text: text.trim(), color: photoMarkColor };
      setPhotoMarkText(text);
      setPhotoMarksForTarget(photoEditorTarget, marks => [
        ...marks,
        nextMark,
      ]);
      setEditingPhotoMark(nextMark);
      return;
    }

    if (photoMarkTool === 'line') {
      const nextMark: PhotoLineMark = { id, type: 'line', x1: x, y1: y, x2: Math.min(100, x + 18), y2: y, color: photoMarkColor };
      setPhotoMarksForTarget(photoEditorTarget, marks => [
        ...marks,
        nextMark,
      ]);
      setEditingPhotoMark(nextMark);
      return;
    }

    const nextMark: PhotoEllipseMark = { id, type: 'ellipse', x, y, width: 24, height: 16, rotation: 0, color: photoMarkColor };
    setPhotoMarksForTarget(photoEditorTarget, marks => [
      ...marks,
      nextMark,
    ]);
    setEditingPhotoMark(nextMark);
  };

let pressTimer: NodeJS.Timeout;

const handlePressStart = (photo: string) => {
  pressTimer = setTimeout(() => {
    setPreviewPhoto(photo);
  }, 500); // 0.5秒長押し
};

const handlePressEnd = () => {
  clearTimeout(pressTimer);
};

  // --- 写真削除用関数を追加 ---
  //const removePhoto = (index: number) => {
    //const newPhotos = [...photos];
    //newPhotos[index] = null;
    //setPhotos(newPhotos);
    //};

// --- 1. 一覧取得関数（独立した関数として定義） ---
  const fetchKarteList = async () => {

  if (!spreadsheetId) return;

  setIsLoading(true);

  try {

    const result = await gasApi("getKarteList", {
      spreadsheetId,
      type: "photo"
    });

    if (result.success) {

      setExistingKartes(result.list);
      goTo("edit_list");

    }

  } catch (e) {

    console.error(e);
    alert("通信エラーが発生しました");

  } finally {

    setIsLoading(false);

  }

};

const applyPhotoKarteData = (data: Record<string, unknown>, editMode: boolean) => {
  const d = data;

  setKarteNo(String(d.karteNo || ''));
  setStructEval(getRecordText(d, ['structEval', 'structureEval', 'structuralEval']));
  setImpactEval(getRecordText(d, ['impactEval']));
  setTotalEval(getRecordText(d, ['totalEval', 'evaluation']));
  setPrevYearEval(getRecordText(d, ['prevYearEval', 'previousYearEval']));
  setFirstKarteNo(getRecordText(d, ['firstKarteNo', 'initialKarteNo']));
  const loadedFirstDate = formatSheetDateText(d.firstDate);
  setFirstDate(loadedFirstDate);
  setPhotoKarteStoredFirstDate(loadedFirstDate);
  const loadedFirstInspector = getRecordText(d, ['firstInspector', 'initialInspector']);
  const loadedInspector = getRecordText(d, ['inspector']);
  setFirstInspector(loadedFirstInspector);
  setPhotoKarteStoredFirstInspector(loadedFirstInspector);
  setPhotoKarteSelectedInspector(loadedInspector);
  setFirstFinish(getRecordText(d, ['firstFinish', 'initialFinish', 'finishType']));
  setFirstSituation(getRecordText(d, ['firstSituation', 'initialSituation', 'firstRemarks2']));
  setFirstDetail(getRecordText(d, ['firstDetail', 'initialDetail', 'firstRemarks3']));
  setInspectDate(normalizeDateForDateInput(d.inspectDate));
  setContractor(
    String(d.contractor || '').trim()
      ? String(d.contractor)
      : contractor
  );
  setBuildingCategory(getRecordText(d, ['buildingCategory', 'buildingName']));
  setInspectionPlace(getRecordText(d, ['inspectionPlace', 'place']));
  setLocationDetail(getRecordText(d, ['locationDetail', 'detailPlace']));
  setInspector(loadedInspector);
  setRemarks1(getRecordText(d, ['remarks1', 'currentFinish', 'latestFinish']));
  setRemarks2(getRecordText(d, ['remarks2', 'currentSituation', 'latestSituation', 'situation']));
  setRemarks3(getRecordText(d, ['remarks3', 'currentDetail', 'latestDetail', 'detail']));

  setPhotos(normalizePhotoArray(
    d,
    ['photos', 'photoUrls', 'currentPhotos', 'currentPhotoUrls', 'latestPhotos', 'latestPhotoUrls', 'photoFiles'],
    ['photo', 'currentPhoto', 'latestPhoto']
  ));
  setFirstPhotos(normalizePhotoArray(
    d,
    ['firstPhotos', 'firstPhotoUrls', 'initialPhotos', 'initialPhotoUrls', 'firstPhotoFiles'],
    ['firstPhoto', 'initialPhoto']
  ));
  setCurrentPhotoMarks(normalizePhotoMarks(d.photoMarks));
  setFirstPhotoMarks(normalizePhotoMarks(d.firstPhotoMarks));

  setIsEditMode(editMode);
  setMode('karte_edit');
};

// --- 指定したNoのカルテデータを読み込む関数 ---
  const loadKarteData = async (no: string) => {
  if (!spreadsheetId) return;
  const unsaved = unsavedPhotoKartes.find(item => String(item.karteNo) === String(no));
  if (unsaved) {
    applyPhotoKarteData(unsaved.payload, false);
    return;
  }

  setIsLoading(true);
  try {
const result = await gasApi("getKarteData", {
  spreadsheetId,
  karteNo: no,
  station: stationName,
  year: selectedYear,
  routeFolderId,
});
    
    if (result.success) {
      applyPhotoKarteData(toRecord(result.data), true);
    }
  } catch (e) {
    alert("読み込みエラーが発生しました");
  } finally {
    setIsLoading(false);
  }
};

  const buildKartePayload = async (actionType: "uploadKarte" | "uploadInclination") => {
      let payloadFirstDate = firstDate;
      let payloadInspectDate = inspectDate;
      let payloadFirstInspector = firstInspector;
      let payloadInspector = inspector;

      if (actionType === "uploadKarte") {
        const masterDates = await fetchInspectionListDates();
        if (!masterDates) {
          throw new Error("点検リスト_マスタの日付を取得できませんでした");
        }

        const hasCurrentPhoto = photos.some(photo => Boolean(photo));
        payloadFirstDate = hasCurrentPhoto
          ? firstDate || masterDates.firstDates[0] || ""
          : masterDates.inspectDate || "";
        payloadInspectDate = hasCurrentPhoto ? masterDates.inspectDate || "" : "";

        setPhotoKarteMasterDates({
          firstDates: masterDates.firstDates,
          inspectDate: masterDates.inspectDate || '',
        });
        setFirstDate(payloadFirstDate);
        setInspectDate(payloadInspectDate);
        if (masterDates.stationNo) setStationNo(masterDates.stationNo);

        payloadFirstInspector = hasCurrentPhoto
          ? photoKarteStoredFirstInspector
          : photoKarteSelectedInspector;
        payloadInspector = hasCurrentPhoto ? photoKarteSelectedInspector : "";
        setFirstInspector(payloadFirstInspector);
        setInspector(payloadInspector);
      }

      // 画像のリサイズ処理
      const photoDataList = await Promise.all(
  photos.map(async (p, index) => {
    if (p && p.startsWith("data:image")) {

      const marks = currentPhotoMarks[index] || [];
      const resized = await renderPhotoForSave(p, marks);
      const original = marks.length ? await resizeImage(p) : "";

      return {
        no: index + 1,
        fileName: `${index + 1}.jpg`,
        base64: resized.includes(',')
          ? resized.split(',')[1]
          : resized,
        originalBase64: original
          ? original.includes(',') ? original.split(',')[1] : original
          : ""
      };

    }

    return null;
  })
);

      const validPhotos = photoDataList.filter(Boolean);

const firstPhotoDataList = await Promise.all(
  firstPhotos.map(async (p, index) => {

    if (p && p.startsWith("data:image")) {

      const marks = firstPhotoMarks[index] || [];
      const resized = await renderPhotoForSave(p, marks);
      const original = marks.length ? await resizeImage(p) : "";

      return {
        no: index + 1,
        fileName: `初回点検_${index + 1}.jpg`,
        base64: resized.includes(',')
          ? resized.split(',')[1]
          : resized,
        originalBase64: original
          ? original.includes(',') ? original.split(',')[1] : original
          : ""
      };

    }

    return null;

  })
);

      const validFirstPhotos = firstPhotoDataList.filter(Boolean);

      const payload = {
  isUpdate: isEditMode,
  spreadsheetId,
  folderId: stationFolderId,
  station: stationName,
  year: selectedYear,
  routeFolderId,
  karteNo: karteNo,
  structEval,
  impactEval,
  totalEval,
  prevYearEval,
  firstKarteNo,
  firstDate: payloadFirstDate,
  firstInspector: payloadFirstInspector,
  firstFinish,
  firstSituation,
  firstDetail,
  inspectDate: payloadInspectDate,
  contractor,
  inspector: payloadInspector,
  buildingCategory,
  inspectionPlace,
  locationDetail,
  remarks1,
  remarks2,
  remarks3,
  photoFiles: validPhotos,
  firstPhotoFiles: validFirstPhotos,
  photoMarks: currentPhotoMarks,
  firstPhotoMarks,
  evalFontColors: {
    structEval: getEvalFontColor('structEval', structEval),
    totalEval: getEvalFontColor('totalEval', totalEval),
  },
};

      return payload;
  };

  // --- 2. 送信ロジック（独立した関数として定義） ---
  const sendGenericKarte = async (actionType: "uploadKarte" | "uploadInclination") => {
    if (!karteNo || isSending) return;
    setIsSending(true);

    try {
      const payload = await buildKartePayload(actionType);
      const result = await gasApi(actionType, payload);
      
      if (result.success) {
        alert(`スプレッドシートの更新が完了しました！ (No.${karteNo})`);
        if (actionType === "uploadKarte") {
          const draftId = `${spreadsheetId}:${karteNo}`;
          const existingDraft = unsavedPhotoKartes.find(item => item.id === draftId);
          if (existingDraft) {
            await deleteUnsavedPhotoKarteFromDb(draftId);
            await refreshUnsavedPhotoKartes();
          }
          gasApi("releaseReservedPhotoKarteNumber", { spreadsheetId, karteNo })
            .catch(error => console.warn("一時保存No.の予約解除に失敗しました", error));
          setMode('karte_menu');
        }
      } else {
        alert("保存に失敗しました: " + (result.error || "不明なエラー"));
      }
    } catch (e) {
      console.error(e);
      alert(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSending(false);
    }
  };

  const savePhotoKarteDraft = async () => {
    if (!spreadsheetId) return alert("スプレッドシートIDがありません");
    if (!karteNo || isSending) return;

    const draftId = `${spreadsheetId}:${karteNo}`;
    const isReplacing = unsavedPhotoKartes.some(item => item.id === draftId);

    if (!isReplacing && unsavedPhotoKarteCount >= UNSAVED_PHOTO_KARTE_LIMIT) {
      alert(`未保存カルテが${UNSAVED_PHOTO_KARTE_LIMIT}件あります。先にスプレッドシートへ保存してください。`);
      return;
    }

    setIsSending(true);

    try {
      const payload = await buildKartePayload("uploadKarte");
      await gasApi("reservePhotoKarteNumber", { spreadsheetId, karteNo });
      await saveUnsavedPhotoKarteToDb({
        id: draftId,
        spreadsheetId,
        karteNo: String(karteNo),
        stationName,
        year: selectedYear,
        payload,
        savedAt: new Date().toISOString(),
      });

      const rows = await refreshUnsavedPhotoKartes();
      setExistingKartes(current => Array.from(new Set([...current, String(karteNo)])));

      if (rows.length >= UNSAVED_PHOTO_KARTE_LIMIT) {
        const shouldSync = confirm(
          `スプレッドシートへの未保存カルテが${rows.length}件になりました。\n今すぐスプレッドシートへ保存しますか？`
        );
        if (shouldSync) {
          await syncUnsavedPhotoKartes(rows);
          return;
        }

        setMode('karte_menu');
      } else {
        alert(`No.${karteNo} を一時保存しました。未保存 ${rows.length}件 / あと${UNSAVED_PHOTO_KARTE_LIMIT - rows.length}件作成できます。`);
        setMode('karte_menu');
      }
    } catch (e) {
      console.error(e);
      alert(`一時保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSending(false);
    }
  };

  const syncUnsavedPhotoKartes = async (targetRows = unsavedPhotoKartes) => {
    if (!spreadsheetId) return alert("スプレッドシートIDがありません");
    if (targetRows.length === 0) return alert("スプレッドシートへ保存する未保存カルテはありません");
    if (isSending) return;

    setIsSending(true);

    const failed: string[] = [];

    try {
      for (const item of targetRows) {
        try {
          const result = await gasApi("uploadKarte", item.payload);
          if (result.success) {
            await deleteUnsavedPhotoKarteFromDb(item.id);
            gasApi("releaseReservedPhotoKarteNumber", {
              spreadsheetId: item.spreadsheetId,
              karteNo: item.karteNo,
            }).catch(error => console.warn("一時保存No.の予約解除に失敗しました", error));
          } else {
            failed.push(`${item.karteNo}: ${result.error || "不明なエラー"}`);
          }
        } catch (error) {
          failed.push(`${item.karteNo}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const rows = await refreshUnsavedPhotoKartes();

      if (failed.length > 0) {
        alert(`一部のカルテを保存できませんでした。\n${failed.join('\n')}`);
        return;
      }

      alert(`未保存カルテ ${targetRows.length}件をスプレッドシートへ保存しました。`);
      setMode('karte_menu');
      setExistingKartes(current =>
        Array.from(new Set([
          ...current,
          ...targetRows.map(item => String(item.karteNo)),
        ])).sort((a, b) => Number(a) - Number(b))
      );
      if (rows.length === 0) {
        await loadKarteNumberOptions();
      }
    } finally {
      setIsSending(false);
    }
  };

    // const handleMarkerDrag = (touchX: number, touchY: number) => {
    //if (draggingMarkerId === null || !imageRef.current) return;
    //const rect = imageRef.current.getBoundingClientRect();
    //const x = ((touchX - rect.left) / rect.width) * 100;
    //const y = ((touchY - rect.top) / rect.height) * 100;
    //setMarkers(prev => prev.map(m =>
    //  m.id === draggingMarkerId ? { ...m, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } : m
    //));
  //};
const resetAllState = () => {
  setStationNo("");
  setStationName("");
  setSelectedYear("");
  setSpreadsheetId("");

  setMarkers([]);
  setPhotos(Array(4).fill(null));
  setFirstPhotos(Array(4).fill(null));
  setCurrentPhotoMarks(createEmptyPhotoMarkSets());
  setFirstPhotoMarks(createEmptyPhotoMarkSets());
  setSourceImage(null);
  setFinalImage(null);
  setExistingKartes([]);
  setIsEditMode(false);
  setFirstKarteNo("");
  setContractor("");
  setInspector("");
  setInspectorOptions([]);
};

const goTo = (next: AppMode) => {
  setHistory(prev => {
    // 同じ画面なら履歴に追加しない
    if (mode === next) return prev;
    return [...prev, mode];
  });
  setMode(next);
};

const goBack = () => {
  setHistory(prev => {
    if (prev.length === 0) return prev;

    const newHistory = [...prev];
    const last = newHistory.pop();

    if (last) {
      setMode(last);
    } else {
      setMode('menu'); // 念のため
    }

    return newHistory;
  });
};

const buildAvailableNumbers = (blockedNumbers: string[]) => {
  const blocked = new Set(blockedNumbers.map(n => String(n).trim()).filter(Boolean));
  const numbers: string[] = [];

  for (let i = 1; i <= 999; i++) {
    const no = String(i);
    if (!blocked.has(no)) numbers.push(no);
  }

  return numbers;
};

const loadKarteNumberOptions = async () => {

  if (!spreadsheetId) return [];

  setIsLoading(true);

  try {

    const [unavailableResult, existingResult, reservedResult] = await Promise.all([
      gasApi("getUnavailableKarteNumbers", { spreadsheetId }),
      gasApi("getKarteList", { spreadsheetId, type: "photo" }),
      gasApi("getReservedPhotoKarteNumbers", { spreadsheetId })
    ]);

    const unavailable = Array.isArray(unavailableResult.list)
      ? unavailableResult.list.map((n: unknown) => String(n).trim()).filter(Boolean)
      : [];

    const existing = Array.isArray(existingResult.list)
      ? existingResult.list.map((n: unknown) => String(n).trim()).filter(Boolean)
      : [];

    const reserved = Array.isArray(reservedResult.list)
      ? reservedResult.list.map((n: unknown) => String(n).trim()).filter(Boolean)
      : [];

    const unsaved = unsavedPhotoKartes
      .map(item => String(item.karteNo).trim())
      .filter(Boolean);

    const blocked = Array.from(new Set([...unavailable, ...existing, ...reserved, ...unsaved]));

    const available = buildAvailableNumbers(blocked);

    setUnavailableKarteNumbers([...unavailable]);

    setExistingKartes([...existing]);

    setAvailableKarteNumbers([...available]);

    return available;

  } catch (e) {

    console.error(e);
    return [];

  } finally {

    setIsLoading(false);

  }
};

const loadPdfSheetOptions = async () => {
  if (!spreadsheetId) return;

  setIsLoading(true);

  try {
    const result = await gasApi("getPdfSheetOptions", { spreadsheetId });
    const groups: PdfSheetGroups = {
      cover: Array.isArray(result.groups?.cover) ? result.groups.cover : [],
      photo: Array.isArray(result.groups?.photo) ? result.groups.photo : [],
      photoPositionMap: Array.isArray(result.groups?.photoPositionMap) ? result.groups.photoPositionMap : [],
      slope: Array.isArray(result.groups?.slope) ? result.groups.slope : [],
      inclination: Array.isArray(result.groups?.inclination) ? result.groups.inclination : [],
      inspectionReport: Array.isArray(result.groups?.inspectionReport) ? result.groups.inspectionReport : [],
    };

    setPdfSheets(groups);

    const allSheetNames = [
      ...groups.cover,
      ...groups.photoPositionMap,
      ...groups.inspectionReport,
      ...groups.photo,
      ...groups.slope,
      ...groups.inclination,
    ].map(sheet => sheet.name);

    setSelectedPdfSheets(allSheetNames);
  } catch (e) {
    console.error(e);
    alert("PDF作成用のシート一覧取得に失敗しました");
  } finally {
    setIsLoading(false);
  }
};

const togglePdfSheet = (sheetName: string) => {
  setSelectedPdfSheets(current =>
    current.includes(sheetName)
      ? current.filter(name => name !== sheetName)
      : [...current, sheetName]
  );
};

const togglePdfGroup = (sheets: PdfSheetOption[]) => {
  const names = sheets.map(sheet => sheet.name);
  const allSelected = names.every(name => selectedPdfSheets.includes(name));

  setSelectedPdfSheets(current => {
    if (allSelected) {
      return current.filter(name => !names.includes(name));
    }

    return Array.from(new Set([...current, ...names]));
  });
};

const chunkPdfSheetNames = (sheetNames: string[], size: number) => {
  const chunks: string[][] = [];

  for (let index = 0; index < sheetNames.length; index += size) {
    chunks.push(sheetNames.slice(index, index + size));
  }

  return chunks;
};

const createPdf = async () => {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (selectedPdfSheets.length === 0) return alert("PDF化するシートを選択してください");

  setIsSending(true);

  try {
    const basePdfJobs = [
      { kind: "cover", suffix: "表紙", sheetNames: pdfSheets.cover.map(sheet => sheet.name) },
      { kind: "photoPositionMap", suffix: "写真カルテ番号位置図", sheetNames: pdfSheets.photoPositionMap.map(sheet => sheet.name) },
      { kind: "inspectionReport", suffix: "施設点検報告書", sheetNames: pdfSheets.inspectionReport.map(sheet => sheet.name) },
      { kind: "photo", suffix: "写真カルテ", sheetNames: pdfSheets.photo.map(sheet => sheet.name) },
      { kind: "slope", suffix: "傾斜表", sheetNames: pdfSheets.slope.map(sheet => sheet.name) },
      { kind: "inclination", suffix: "傾斜測定カルテ", sheetNames: pdfSheets.inclination.map(sheet => sheet.name) },
    ]
      .map(job => ({
        ...job,
        sheetNames: job.sheetNames.filter(name => selectedPdfSheets.includes(name)),
      }))
      .filter(job => job.sheetNames.length > 0);
    const pdfJobs = basePdfJobs.flatMap(job => {
      if (job.kind !== "photo" || job.sheetNames.length <= PHOTO_PDF_CHUNK_SIZE) {
        return [job];
      }

      return chunkPdfSheetNames(job.sheetNames, PHOTO_PDF_CHUNK_SIZE).map((sheetNames, index) => {
        const first = sheetNames[0] || "";
        const last = sheetNames[sheetNames.length - 1] || "";
        const rangeLabel = first && last ? `${first}-${last}` : `${index + 1}`;

        return {
          ...job,
          suffix: `${job.suffix}_${rangeLabel}`,
          sheetNames,
        };
      });
    });

    const createdFiles = [];

    for (const job of pdfJobs) {
      const startedAt = new Date().toISOString();
      const payload = {
        spreadsheetId,
        stationName,
        year: selectedYear,
        pdfKind: job.kind,
        fileSuffix: job.suffix,
        sheetNames: job.sheetNames,
      };
      let result: any;

      try {
        result = await gasApi("createInspectionPdf", payload);
      } catch (error) {
        if (!isPdfCreationTimeoutError(error)) {
          throw error;
        }

        const completed = await waitForCompletedPdfFile({
          spreadsheetId,
          stationName,
          year: selectedYear,
          fileSuffix: job.suffix,
          startedAt,
        });

        if (!completed) {
          throw error;
        }

        result = {
          success: true,
          files: [{
            fileName: completed.fileName,
            url: completed.url,
          }],
        };
      }

      if (Array.isArray(result.files) && result.files.length > 0) {
        createdFiles.push(...result.files);
      } else {
        createdFiles.push(result);
      }
    }

    const message = createdFiles
      .map((file: any) => `${file.fileName || ""}\n${file.url || ""}`)
      .join("\n\n");

    alert(`PDFを作成しました。\n${message}`);
  } catch (e) {
    console.error(e);
    alert(`PDF作成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setIsSending(false);
  }
};

const waitForPdfMerge = (ms: number) =>
  new Promise(resolve => window.setTimeout(resolve, ms));

const isPdfCreationTimeoutError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /タイムアウト|504|Gateway Timeout|FUNCTION_INVOCATION_TIMEOUT/i.test(message);
};

const waitForCompletedPdfFile = async (params: {
  spreadsheetId: string;
  stationName: string;
  year: string;
  fileSuffix: string;
  startedAt: string;
}) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitForPdfMerge(5000);
    const completed = await gasApi("findCompletedInspectionPdfFile", params);

    if (completed.completed) {
      return completed;
    }
  }

  return null;
};

const mergeAllPdfs = async () => {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (!stationName) return alert("駅名がありません");
  if (!selectedYear) return alert("年度がありません");

  setIsMergingPdfs(true);

  try {
    const startResult = await gasApi("startInspectionPdfMerge", {
      spreadsheetId,
      stationName,
      year: selectedYear,
      mergeOrder: [
        "表紙",
        "写真カルテ番号位置図",
        "施設点検報告書",
        "写真カルテ",
        "傾斜表",
        "傾斜測定カルテ",
      ],
    });
    const jobId = String(startResult.jobId || "");
    const mergeStartedAt = String(startResult.createdAt || new Date().toISOString());

    if (!jobId) {
      throw new Error("PDF結合の処理を開始できませんでした");
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await waitForPdfMerge(3000);

      const statusResult = await gasApi("getInspectionPdfMergeStatus", { jobId });
      const status = String(statusResult.status || "");

      if (status === "completed") {
        setIsMergingPdfs(false);
        alert(
          `すべての資料を結合しました。\n${statusResult.fileName || ""}\n${statusResult.url || ""}`
        );
        return;
      }

      const completedFile = await gasApi("findCompletedInspectionPdf", {
        spreadsheetId,
        stationName,
        year: selectedYear,
        startedAt: mergeStartedAt,
        previousOutputFileIds: Array.isArray(startResult.previousOutputFileIds)
          ? startResult.previousOutputFileIds
          : [],
      });

      if (completedFile.completed) {
        setIsMergingPdfs(false);
        alert(
          `すべての資料を結合しました。\n${completedFile.fileName || ""}\n${completedFile.url || ""}`
        );
        return;
      }

      if (status === "failed") {
        throw new Error(statusResult.message || "PDFの結合に失敗しました");
      }
    }

    throw new Error("PDF結合に時間がかかっています。しばらく待ってから再度お試しください");
  } catch (e) {
    console.error(e);
    setIsMergingPdfs(false);
    alert(`PDF結合に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setIsMergingPdfs(false);
  }
};

const registerUnavailableKarteNumber = async () => {
  const no = registerKarteNo.trim();

  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (!/^\d+$/.test(no)) return alert("写真カルテ番号は数字で入力してください");

  setIsLoading(true);

  try {
    const result = await gasApi("addUnavailableKarteNumber", {
      spreadsheetId,
      karteNo: no
    });

    if (result.success) {
      setRegisterKarteNo('');
      await loadKarteNumberOptions();
    }
  } catch (e) {
    console.error(e);
    alert("写真カルテ番号の登録に失敗しました");
  } finally {
    setIsLoading(false);
  }
};

const deleteUnavailableKarteNumber = async (no: string) => {
  if (!spreadsheetId) return;

  setIsLoading(true);

  try {
    const result = await gasApi("deleteUnavailableKarteNumber", {
      spreadsheetId,
      karteNo: no
    });

    if (result.success) {
      await loadKarteNumberOptions();
    }
  } catch (e) {
    console.error(e);
    alert("削除に失敗しました");
  } finally {
    setIsLoading(false);
  }
};

  const Nav = () => (
    <div className="w-full mb-4 px-2 shrink-0">
      <div className="flex justify-between mb-2">
        <button onClick={goBack} className="transition-all active:scale-95 active:brightness-90 px-5 py-2 bg-slate-200 rounded-xl font-bold text-slate-700 text-sm">← 戻る</button>
        <button onClick={() => { resetAllState(); setHistory([]); setMode('menu'); }}className="transition-all active:scale-95 active:brightness-90 px-5 py-2 bg-slate-800 rounded-xl font-bold text-white text-sm">🏠 ホーム</button>
      </div>
      
      {/* 駅名と年度を表示するヘッダー */}
      {(stationName || selectedYear) && (
        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-2 rounded-r-lg shadow-sm mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-black text-indigo-900">
            {selectedRoute}
            </span>
            <span className="text-[10px] font-bold text-indigo-400">駅名:</span>
            <span className="text-sm font-black text-indigo-900">{stationName || "---"}</span>
            <span className="text-[10px] font-bold text-indigo-400 ml-2">年度:</span>
            <span className="text-sm font-black text-indigo-900">{selectedYear || "---"}</span>
          </div>
        </div>
      )}
    </div>
  );

  // --- 送信中のくるくるアニメーション（全画面共通） ---
  const LoadingOverlay = () =>
  (isSending || isLoading || isMergingPdfs) ? (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[99999]">
      <div className="bg-white p-10 rounded-3xl flex flex-col items-center shadow-2xl">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>

        <p className="text-slate-900 font-bold text-lg">
          {isMergingPdfs
            ? 'すべての資料を結合しています...'
            : isSending
              ? '保存しています...'
              : '読み込んでいます...'}
        </p>

        <p className="text-slate-500 text-sm">
          そのままお待ちください
        </p>

      </div>
    </div>
  ) : null;

const LoadingSpinner = () => isLoading ? (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[99999]">
    <div className="bg-white p-10 rounded-3xl flex flex-col items-center shadow-2xl">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-slate-900 font-bold text-lg">作成中...</p>
      <p className="text-slate-500 text-sm">そのままお待ちください</p>
    </div>
  </div>
) : null;

  // --- 画面表示 ---
const selectedRouteColor = getRouteColor(getRouteIndex(routeList, selectedRoute, routeFolderId));
const routePageStyle: React.CSSProperties | undefined = selectedRoute
  ? { backgroundColor: selectedRouteColor.background }
  : undefined;

if (mode === 'route_select') return (

  <div className="flex flex-col items-center justify-start h-screen bg-slate-50 p-6 text-black">

    <div className="w-full max-w-md mb-6">
      <button
        onClick={goBack}
        className="transition-all active:scale-95 active:brightness-90 px-5 py-2 bg-slate-200 rounded-xl font-bold text-slate-700 text-sm"
      >
        ← 戻る
      </button>
    </div>

    <h1 className="text-3xl font-black mb-8">
      路線選択
    </h1>

    <div className="w-full max-w-md flex flex-col gap-4">

      {routeList.map((route, index) => {
        const routeColor = getRouteColor(index);

        return (

        <button
          key={route.folderId}
          onClick={() => {

            setSelectedRoute(route.name);
            setRouteFolderId(route.folderId);
            setStationNo('');
            setStationName('');
            setSelectedYear('');
            setSpreadsheetId('');
            setStationFolderId('');
            setExistingData([]);
            existingDataLoadedRouteRef.current = '';
            setExistingKartes([]);

            setMode('menu');

          }}
          className="w-full py-6 rounded-2xl text-xl font-bold shadow-xl transition-all active:scale-95 active:brightness-90"
          style={{
            backgroundColor: routeColor.button,
            color: routeColor.text,
          }}
        >
          {route.name}
        </button>

        );
      })}

    </div>

  </div>
);

  // 1. メインメニュー画面
  if (mode === 'menu') return (
    <div className="flex flex-col items-center justify-start h-screen gap-6 bg-slate-50 text-black p-6" style={routePageStyle}>
      <div className="w-full max-w-md bg-white border border-indigo-100 rounded-2xl shadow-sm p-5 text-center">
        <div className="text-xs font-bold text-indigo-500 mb-1">選択中の路線</div>
        <div className="text-2xl font-black text-slate-900 text-center">
          {selectedRoute || '未選択'}
        </div>
      </div>

      <button
        onClick={() => goTo('route_select')}
        className="transition-all active:scale-95 active:brightness-90 w-full max-w-md py-5 bg-white border-2 border-indigo-500 text-indigo-700 rounded-2xl shadow-md text-lg font-bold"
      >
        路線を選択
      </button>

      <h1 className="text-3xl font-black mt-4 mb-2 text-center">施設点検システム</h1>

      <button
        onClick={() => goTo('new_entry')}
        disabled={!routeFolderId}
        className="transition-all active:scale-95 active:brightness-90 w-full max-w-xs py-10 bg-indigo-600 text-white rounded-3xl shadow-xl text-xl font-bold disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
      >
        ➕ 新規駅を開始
      </button>
      <button
        onClick={() => goTo('exist_select')}
        disabled={!routeFolderId}
        className="transition-all active:scale-95 active:brightness-90 w-full max-w-xs py-10 bg-emerald-600 text-white rounded-3xl shadow-xl text-xl font-bold disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
      >
        📂 既存駅を編集
      </button>
    </div>
  );

  // 2. 作成済みカルテの一覧選択画面
  // --- 画面表示 (edit_list部分) ---
if (mode === 'edit_list') {
  const displayedKartes = Array.from(new Set([
    ...existingKartes.map(no => String(no)),
    ...unsavedPhotoKartes.map(item => String(item.karteNo)),
  ])).sort((a, b) => Number(a) - Number(b));

  return (
  <div className="flex flex-col items-center justify-start min-h-screen bg-slate-100 p-6 text-black" style={routePageStyle}>

    <LoadingSpinner />
    <LoadingOverlay />

    <Nav />

    <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl">
      <h2 className="text-2xl font-bold mb-6 text-blue-700 text-center">修正するカルテを選択</h2>
      <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-sm font-black text-amber-900">
        未保存 {unsavedPhotoKarteCount}件 / あと{remainingUnsavedPhotoKarteCount}件作成できます
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        {displayedKartes.map(no => {
          const isComplete = isPhotoKarteComplete(no);
          const isUnsaved = unsavedPhotoKarteNumbers.has(String(no));

          return (
            <button
              key={no}
              // ★ ここを loadKarteData に書き換え！
              onClick={() => loadKarteData(String(no))} 
              className={`p-4 border-2 rounded-xl font-bold shadow-sm active:scale-95 transition-all text-center ${
                isUnsaved
                  ? "bg-amber-400 border-amber-600 text-slate-950"
                  : isComplete
                  ? "bg-emerald-500 border-emerald-700 text-white"
                  : "bg-white border-blue-500 text-blue-700 active:bg-blue-500 active:text-white"
              }`}
            >
              <span className="block">No.{no}</span>
              {isUnsaved && (
                <span className="mt-1 block text-[11px] font-black">未保存</span>
              )}
              {isComplete && (
                <span className="mt-1 block text-[11px] font-black">完了済み</span>
              )}
            </button>
          );
        })}
      </div>

      <button onClick={goBack} className="w-full mt-8 py-3 bg-slate-200 rounded-xl font-bold text-slate-600">戻る</button>
    </div>
  </div>
);
}

  // ① 新規駅登録画面
if (mode === 'new_entry') return (
  <div className="flex flex-col items-center justify-start h-screen bg-slate-50 p-6 text-black" style={routePageStyle}>
    <LoadingSpinner /> <Nav />
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">

      <h2 className="text-2xl font-bold mb-6 text-indigo-700">
        新規駅登録
      </h2>

      {/* 駅番号 */}
      <input
        type="number"
        value={stationNo}
        onChange={(e) => setStationNo(e.target.value)}
        className="w-full p-4 border-2 rounded-xl mb-4"
        placeholder="駅番号"
      />

      {/* 駅名（手入力） */}
      <input
        value={stationName}
        onChange={(e) => setStationName(e.target.value)}
        className="w-full p-4 border-2 rounded-xl mb-4"
        placeholder="駅名"
      />

      {/* 年度（手入力） */}
      <input
        value={selectedYear}
        onChange={(e) => setSelectedYear(e.target.value)}
        className="w-full p-4 border-2 rounded-xl mb-6"
        placeholder="年度"
      />

      <button
  onClick={handleCreateNewSheet}
  disabled={isLoading}
  className={`w-full py-5 rounded-2xl font-bold transition-all ${
    isLoading 
      ? "bg-indigo-300 text-white" 
      : "bg-indigo-600 text-white active:scale-95"
  }`}
>
  {isLoading ? "作成中..." : "新規作成して開始"}
</button>

    </div>
  </div>
);


// ② 既存駅編集画面
if (mode === 'exist_select') return (
  <div className="flex flex-col items-center justify-start h-screen bg-slate-50 p-6 text-black" style={routePageStyle}>
    <Nav />

    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">

      <h2 className="text-2xl font-bold mb-6 text-emerald-700">
        既存駅を編集
      </h2>

      {/* ★読み込み中 */}
      {isLoading ? (

        <div className="flex flex-col items-center py-12">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
          <div className="mt-4 text-sm text-slate-500">
            駅データ読込中...
          </div>
        </div>

      ) : (

        <>
          {/* 駅名 */}
          <select
            value={stationName}
            onChange={(e) => {
              setStationName(e.target.value);
              setSelectedYear('');
            }}
            className="w-full p-4 border-2 rounded-xl mb-4"
          >
            <option value="">駅を選択</option>

            {Array.from(
              new Set(existingData.map(d => d.stationName))
            ).map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* 年度 */}
          <select
            value={selectedYear}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedYear(val);

              const target = existingData.find(
                d =>
                  d.stationName === stationName &&
                  String(d.year) === val
              );

              if (target?.spreadsheetId) {
                setSpreadsheetId(target.spreadsheetId);
                setStationFolderId(target.folderId || '');
                setStationNo(String(target.stationNo || ''));
              }
            }}
            disabled={!stationName}
            className="w-full p-4 border-2 rounded-xl mb-6"
          >
            <option value="">年度を選択</option>

            {existingData
              .filter(d => d.stationName === stationName)
              .map((d, i) => (
                <option key={i} value={String(d.year)}>
                  {d.year}年度
                </option>
              ))}
          </select>

          <button
            onClick={() => goTo('task_select')}
            disabled={!stationName || !selectedYear || !spreadsheetId}
            className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-bold"
          >
            この駅を編集
          </button>
        </>

      )}

    </div>
  </div>
);

  if (mode === 'task_select') {
  return <TaskSelect goTo={goTo} Nav={Nav} backgroundColor={selectedRouteColor.background} />;
}
  if (mode === 'cover') {
    return (
      <div className="flex min-h-screen flex-col items-center bg-slate-50 p-6 text-black" style={routePageStyle}>
        <Nav />
        <LoadingOverlay />

        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 text-center text-2xl font-black tracking-[0.28em] text-slate-900">
            表紙
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-h-5 flex-1 text-sm font-bold text-slate-500">
              {coverDateStatus}
            </div>
            <button
              type="button"
              onClick={loadCoverInspectionDate}
              disabled={isLoading || isSending}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 active:scale-95 disabled:opacity-50"
            >
              調査日を再取得
            </button>
          </div>

          <div className="mb-6 overflow-hidden rounded-2xl border-2 border-slate-800 bg-white text-[15px] shadow-sm">
            <div className="flex border-b-2 border-slate-800">
              <div className="flex min-h-14 w-[140px] shrink-0 items-center justify-center border-r-2 border-slate-800 bg-slate-200 px-3 font-black">
                駅No.
              </div>
              <div className="flex min-h-14 flex-1 items-center px-4 font-bold">
                {stationNo || "---"}
              </div>
            </div>

            <div className="flex border-b-2 border-slate-800">
              <div className="flex min-h-14 w-[140px] shrink-0 items-center justify-center border-r-2 border-slate-800 bg-slate-200 px-3 font-black">
                駅名
              </div>
              <div className="flex min-h-14 flex-1 items-center px-4 font-bold">
                {stationName || "---"}
              </div>
            </div>

            <div className="flex">
              <div className="flex min-h-14 w-[140px] shrink-0 items-center justify-center border-r-2 border-slate-800 bg-slate-200 px-3 font-black">
                調査日
              </div>
              <input
                value={formatSheetDateText(inspectDate)}
                onChange={e => setInspectDate(e.target.value)}
                className="block min-h-14 min-w-0 flex-1 px-4 text-[15px] font-bold outline-none focus:bg-yellow-50"
              />
            </div>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={sendCover}
              disabled={isSending || !spreadsheetId}
              className="w-full max-w-xs rounded-xl bg-blue-600 py-4 text-lg font-black text-white shadow-sm active:scale-95 disabled:bg-slate-400"
            >
              {isSending ? "反映中..." : "表紙作成"}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (mode === 'inspection_report') {
    const previousYearLabel = '前年度評価';

    return (
      <div className="min-h-screen overflow-x-auto bg-slate-300 p-4 text-black" style={routePageStyle}>
        <Nav />
        <LoadingOverlay />

        <div className="mx-auto min-w-[1180px] max-w-[1280px] text-[13px]">
          <div className="mb-3 border-2 border-slate-800 bg-white px-4 py-4 text-center text-xl font-black tracking-[0.45em] shadow-sm">
            <span>〈 {selectedYear || '----'} 年 度 施 設 点 検 報 告 書 〉</span>
          </div>

          <div className="mb-3 grid grid-cols-[100px_120px_60px_1fr_130px_1fr] border-2 border-slate-800 bg-white shadow-sm">
            <div className="border-r-2 border-slate-800 bg-slate-200 px-2 py-1 text-center text-[15px] font-bold flex items-center justify-center">駅No.</div>
            <input className="border-r-2 border-slate-800 px-2 py-1 text-center text-[15px] font-bold outline-none" value={stationNo} onChange={e => setStationNo(e.target.value)} />
            <div className="border-r-2 border-slate-800 bg-slate-200 px-2 py-1 text-center text-[15px] font-bold flex items-center justify-center">駅名</div>
            <input className="border-r-2 border-slate-800 px-2 py-1 text-center text-[15px] font-bold outline-none" value={stationName} onChange={e => setStationName(e.target.value)} />
            <div className="border-r-2 border-slate-800 bg-slate-200 px-2 py-1 text-center font-bold flex items-center justify-center">点検受注者</div>
            <input className="px-2 py-1 text-center outline-none" value={contractor} onChange={e => setContractor(e.target.value)} />
          </div>

          <div className="mb-3 grid grid-cols-[130px_1fr_130px_1fr] border-2 border-slate-800 bg-white shadow-sm">
            <div className="border-r-2 border-slate-800 bg-slate-200 p-2 text-center font-bold">最新点検日</div>
            <textarea className="min-h-10 resize-y border-r-2 border-slate-800 px-2 py-3 text-center leading-5 outline-none" value={inspectDate} onChange={e => setInspectDate(e.target.value)} rows={2} />
            <div className="border-r-2 border-slate-800 bg-slate-200 p-2 text-center font-bold">点検者</div>
            <textarea className="min-h-10 resize-y px-2 py-3 text-center leading-5 outline-none" value={inspector} onChange={e => setInspector(e.target.value)} rows={2} />
          </div>

          <div className="overflow-hidden border-2 border-slate-800 bg-white shadow-sm">
          <div className="grid grid-cols-[100px_120px_60px_120px_2fr_80px_80px_2fr_72px_72px_88px] bg-slate-100 text-center font-bold">
            <div className="row-span-2 border-r border-b border-slate-900 p-2 flex items-center justify-center gap-1">
              <span>建物名</span>
              <button type="button" onClick={() => sortInspectionReportRows('buildingName')} className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[12px] font-black active:scale-95 ${inspectionReportSort.key === 'buildingName' ? 'border-indigo-700 bg-indigo-600 text-white' : 'border-slate-500 bg-white text-slate-800'}`}>
                {getInspectionReportSortIcon('buildingName')}
              </button>
            </div>
            <div className="row-span-2 border-r border-b border-slate-900 p-2 flex items-center justify-center gap-1">
              <span>点検場所</span>
              <button type="button" onClick={() => sortInspectionReportRows('inspectionPlace')} className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[12px] font-black active:scale-95 ${inspectionReportSort.key === 'inspectionPlace' ? 'border-indigo-700 bg-indigo-600 text-white' : 'border-slate-500 bg-white text-slate-800'}`}>
                {getInspectionReportSortIcon('inspectionPlace')}
              </button>
            </div>
            <div className="row-span-2 border-r border-b border-slate-900 p-2 flex items-center justify-center gap-1">
              <span>写真<br />番号</span>
              <button type="button" onClick={() => sortInspectionReportRows('photoNo')} className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[12px] font-black active:scale-95 ${inspectionReportSort.key === 'photoNo' ? 'border-indigo-700 bg-indigo-600 text-white' : 'border-slate-500 bg-white text-slate-800'}`}>
                {getInspectionReportSortIcon('photoNo')}
              </button>
            </div>
            <div className="row-span-2 border-r border-b border-slate-900 p-2 flex items-center justify-center">仕上げ<br />種別</div>
            <div className="col-span-3 border-r border-b border-slate-900 p-2">初回点検</div>
            <div className="col-span-4 border-b border-slate-900 bg-blue-700 p-2 text-white">{selectedYear || '----'}年度点検</div>
            <div className="border-r border-b border-slate-900 p-2">状況説明</div>
            <div className="border-r border-b border-slate-900 p-2">初年度</div>
            <div className="border-r border-b border-slate-900 p-2">{previousYearLabel}</div>
            <div className="border-r border-b border-slate-900 bg-blue-700 p-2 text-white">状況説明</div>
            <div className="border-r border-b border-slate-900 bg-blue-700 p-2 text-white">構造</div>
            <div className="border-r border-b border-slate-900 bg-blue-700 p-2 text-white">影響</div>
            <div className="border-b border-slate-900 bg-blue-700 p-2 text-white flex items-center justify-center gap-1">
              <span>総合評価</span>
              <button type="button" onClick={() => sortInspectionReportRows('totalEval')} className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[12px] font-black active:scale-95 ${inspectionReportSort.key === 'totalEval' ? 'border-white bg-white text-blue-800' : 'border-blue-100 bg-blue-50 text-blue-800'}`}>
                {getInspectionReportSortIcon('totalEval')}
              </button>
            </div>
          </div>

          <div>
            {inspectionReportRows.map(row => {
              const cells: { field: keyof Omit<InspectionReportRow, 'id'>; editable?: boolean }[] = [
                { field: 'buildingName' },
                { field: 'inspectionPlace' },
                { field: 'photoNo' },
                { field: 'finishType' },
                { field: 'firstSituation', editable: true },
                { field: 'firstEval' },
                { field: 'previousYearEval' },
                { field: 'currentSituation', editable: true },
                { field: 'structEval' },
                { field: 'impactEval' },
                { field: 'totalEval' },
              ];

              return (
                <div key={row.id} className="grid min-h-8 grid-cols-[100px_120px_60px_120px_2fr_80px_80px_2fr_72px_72px_88px] border-b border-slate-300 last:border-b-0">
                  {cells.map(cell =>
                    cell.editable ? (
                      <textarea
                        key={cell.field}
                        className="min-h-8 resize-y border-r border-slate-300 bg-white p-1.5 text-left text-[13px] outline-none focus:bg-yellow-50"
                        value={row[cell.field]}
                        onChange={e => updateInspectionReportRow(row.id, cell.field, e.target.value)}
                        rows={2}
                      />
                    ) : (
                      <div key={cell.field} className={`flex items-center justify-center border-r border-slate-300 p-1.5 text-center last:border-r-0 whitespace-pre-wrap break-words ${getInspectionReportEvalClass(cell.field, row[cell.field])}`}>
                        {renderInspectionReportCellValue(cell.field, row[cell.field])}
                      </div>
                    )
                  )}
                </div>
              );
            })}
            </div>
          </div>
          <div className="mt-6 flex justify-center pb-10">
            <button
              type="button"
              onClick={sendInspectionReport}
              disabled={isSending || isLoading || !spreadsheetId}
              className="w-[460px] rounded-xl bg-blue-700 py-4 text-lg font-black text-white shadow active:scale-95 disabled:bg-slate-400"
            >
              {isSending ? "反映中..." : "施設点検報告書作成"}
            </button>
          </div>
        </div>
      </div>
    );
  }

if (mode === 'pdf_export') {
  const groups: { key: keyof PdfSheetGroups; title: string }[] = [
    { key: 'cover', title: '表紙' },
    { key: 'photoPositionMap', title: '写真カルテ番号位置図' },
    { key: 'inspectionReport', title: '施設点検報告書' },
    { key: 'photo', title: '写真カルテ' },
    { key: 'slope', title: '傾斜表' },
    { key: 'inclination', title: '傾斜測定カルテ' },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 p-6 text-black" style={routePageStyle}>
      <Nav />
      <LoadingOverlay />

      <div className="w-full max-w-5xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-indigo-700">PDF作成</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {stationName || "---"} / {selectedYear || "---"}年度
            </p>
          </div>

          <button
            type="button"
            onClick={loadPdfSheetOptions}
            disabled={isLoading || !spreadsheetId}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 active:scale-95 disabled:opacity-50"
          >
            一覧を更新
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-6">
          {groups.map(group => {
            const sheets = pdfSheets[group.key];
            const allSelected =
              sheets.length > 0 &&
              sheets.every(sheet => selectedPdfSheets.includes(sheet.name));

            return (
              <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-50 md:col-span-2">
                <div className="flex items-center justify-between border-b border-slate-300 bg-slate-100 px-3 py-2">
                  <h3 className="text-sm font-black text-slate-800">{group.title}</h3>
                  <button
                    type="button"
                    onClick={() => togglePdfGroup(sheets)}
                    disabled={sheets.length === 0}
                    className="rounded-xl bg-white px-3 py-1 text-xs font-bold text-indigo-700 disabled:text-slate-300"
                  >
                    {allSelected ? "解除" : "全選択"}
                  </button>
                </div>

                <div className="min-h-28 p-3">
                  {sheets.length === 0 ? (
                    <div className="flex h-20 items-center justify-center text-sm font-bold text-slate-400">
                      作成済みシートなし
                    </div>
                  ) : (
                    <div className={`grid gap-2 ${group.key === 'photo' ? 'grid-cols-5' : 'grid-cols-1'}`}>
                      {sheets.map(sheet => {
                        const checked = selectedPdfSheets.includes(sheet.name);

                        return (
                          <button
                            key={sheet.name}
                            type="button"
                            onClick={() => togglePdfSheet(sheet.name)}
                            className={`min-h-10 rounded-xl border px-2 py-2 text-sm font-black leading-tight active:scale-95 ${
                              checked
                                ? "border-indigo-600 bg-indigo-600 text-white"
                                : "border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            {sheet.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={createPdf}
            disabled={isSending || isMergingPdfs || selectedPdfSheets.length === 0}
            className="w-full rounded-xl bg-blue-600 py-4 text-lg font-black text-white shadow active:scale-95 disabled:bg-slate-400"
          >
            {isSending ? "PDF作成中..." : "種類別PDF作成"}
          </button>
          <button
            type="button"
            onClick={mergeAllPdfs}
            disabled={isSending || isMergingPdfs || !spreadsheetId}
            className="w-full rounded-xl bg-emerald-600 py-4 text-lg font-black text-white shadow active:scale-95 disabled:bg-slate-400"
          >
            {isMergingPdfs ? "資料を結合中..." : "すべての資料を結合"}
          </button>
        </div>
      </div>
    </div>
  );
}

if (mode === 'photo_number_register') return (
  <div className="flex flex-col items-center justify-start min-h-screen bg-slate-50 p-6 text-black" style={routePageStyle}>
    <Nav />
    <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">
      <h2 className="text-2xl font-bold mb-6 text-indigo-700 text-center">写真カルテ番号登録</h2>

      <label className="block text-sm font-bold text-slate-700 mb-2">使用できない写真カルテ番号</label>
      <div className="flex gap-3 mb-6">
        <input
          type="number"
          value={registerKarteNo}
          onChange={(e) => setRegisterKarteNo(e.target.value)}
          className="min-w-0 flex-1 p-4 border-2 rounded-xl outline-none focus:border-indigo-500"
          placeholder="番号を入力"
        />
        <button
          onClick={registerUnavailableKarteNumber}
          disabled={isLoading}
          className="px-5 bg-indigo-600 text-white rounded-xl font-bold disabled:bg-slate-300"
        >
          登録
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-bold text-slate-700">登録済み番号</div>
        <button
  onClick={() => loadKarteNumberOptions()}
  disabled={isLoading}
  className="px-5 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold disabled:text-slate-300 flex items-center gap-2 shadow-sm active:scale-95 transition-all"
>
  {isLoading ? (
    <>
      <svg
        className="animate-spin h-4 w-4"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        ></circle>

        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        ></path>
      </svg>

      更新中...
    </>
  ) : (
    "更新"
  )}
</button>
      </div>


      <div className="min-h-24 max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
        {unavailableKarteNumbers.length > 0 ? (
          <div className="grid grid-cols-5 gap-2">
            {unavailableKarteNumbers.map(no => (
              <div
  key={no}
  className="relative py-2 bg-white border border-slate-200 rounded-lg text-center font-bold text-slate-700"
>
  {no}

  <button
    onClick={() => deleteUnavailableKarteNumber(no)}
    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold"
  >
    ×
  </button>
</div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm font-bold text-slate-400">登録済み番号はありません</div>
        )}
      </div>
    </div>
  </div>
);
      
// 入力内容をすべて空にする関数
const resetKarteFields = () => {
  setStructEval('');
  setImpactEval('');
  setTotalEval('');
  setFirstKarteNo('');
  setFirstDate('');
  setPhotoKarteStoredFirstDate('');
  setFirstInspector('');
  setPhotoKarteStoredFirstInspector('');
  setPhotoKarteSelectedInspector(
    inspectorOptions.includes(inspector) ? inspector : inspectorOptions[0] || ''
  );

  setBuildingCategory('');
  setInspectionPlace('');
  setLocationDetail('');

  setRemarks1('');
  setRemarks2('');
  setRemarks3('');

  setFirstFinish('');
  setFirstSituation('');
  setFirstDetail('');
  // ★追加
  setPhotos(Array(4).fill(null));
  setFirstPhotos(Array(4).fill(null));
  setCurrentPhotoMarks(createEmptyPhotoMarkSets());
  setFirstPhotoMarks(createEmptyPhotoMarkSets());
  };

const getFinishOptions = () => {
  const key = String(inspectionPlace || '').trim();
  return key ? finishOptionsByPlace[key] || [] : [];
};

const getCheckItems = () => {
  const key = String(inspectionPlace || '').trim();
  return key ? checkItemsByPlace[key] || [] : [];
};

const renderPhotoMarkOverlay = (marks: PhotoMark[], interactive = false) => (
  <div className="pointer-events-none absolute inset-0">
    {marks.map(mark => {
      if (mark.type === 'ellipse') {
        return (
          <svg
            key={mark.id}
            className={`absolute inset-0 h-full w-full ${interactive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onClick={interactive ? (e) => {
              e.stopPropagation();
              setEditingPhotoMark(mark);
              setPhotoMarkTool('ellipse');
              setPhotoMarkColor(mark.color);
            } : undefined}
          >
            <ellipse
              cx={mark.x}
              cy={mark.y}
              rx={Math.max(0.5, mark.width / 2)}
              ry={Math.max(0.5, mark.height / 2)}
              fill="none"
              stroke={mark.color}
              strokeWidth={4}
              transform={`rotate(${mark.rotation} ${mark.x} ${mark.y})`}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        );
      }

      if (mark.type === 'line') {
        return (
          <svg
            key={mark.id}
            className={`absolute inset-0 h-full w-full ${interactive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onClick={interactive ? (e) => {
              e.stopPropagation();
              setEditingPhotoMark(mark);
              setPhotoMarkTool('line');
              setPhotoMarkColor(mark.color);
            } : undefined}
          >
            <line
              x1={mark.x1}
              y1={mark.y1}
              x2={mark.x2}
              y2={mark.y2}
              stroke={mark.color}
              strokeWidth={0.75}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        );
      }

      return (
        <div
          key={mark.id}
          className={`${interactive ? 'pointer-events-auto cursor-pointer' : ''} absolute whitespace-pre rounded bg-white/60 px-0.5 text-[13px] font-black leading-tight`}
          style={{
            left: `${mark.x}%`,
            top: `${mark.y}%`,
            color: mark.color,
            fontFamily: '"MS Gothic", "ＭＳ ゴシック", sans-serif',
          }}
          onClick={interactive ? (e) => {
            e.stopPropagation();
            setEditingPhotoMark(mark);
            setPhotoMarkTool('text');
            setPhotoMarkColor(mark.color);
            setPhotoMarkText(mark.text);
          } : undefined}
        >
          {mark.text}
        </div>
      );
    })}
  </div>
);

const addFinishText = (
  value: string,
  current: string,
  setter: React.Dispatch<React.SetStateAction<string>>
) => {
  const finish = value.trim();

  if (!finish) return;
  if (!current.trim()) {
    setter(finish);
    return;
  }
  if (current.split(/[、,\n]/).map(v => v.trim()).includes(finish)) return;

  setter(`${current.trim()}、${finish}`);
};

async function sendCover() {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (isSending) return;

  setIsSending(true);

  try {
    let coverStationNo = stationNo;
    let coverInspectDate = formatSheetDateText(inspectDate);

    if (selectedRoute && stationName && selectedYear) {
      const dateResult = await fetchInspectionListDates();
      coverStationNo = dateResult?.stationNo || coverStationNo;
      coverInspectDate = dateResult?.inspectDate || coverInspectDate;
      if (coverStationNo) setStationNo(coverStationNo);
      if (dateResult?.firstDate) setFirstDate(dateResult.firstDate);
      if (dateResult?.inspectDate) setInspectDate(dateResult.inspectDate);
    }

    const result = await gasApi("uploadCover", {
      spreadsheetId,
      stationNo: coverStationNo,
      stationName,
      inspectDate: coverInspectDate,
    });

    if (result.success) {
      alert("表紙をスプレッドシートへ反映しました");
    } else {
      alert("表紙の反映に失敗しました: " + (result.error || "不明なエラー"));
    }
  } catch (e) {
    console.error(e);
    alert(`表紙の反映に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setIsSending(false);
  }
}

async function sendInspectionReport() {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (isSending) return;

  const rows = inspectionReportRows.filter(row =>
    [
      row.buildingName,
      row.inspectionPlace,
      row.photoNo,
      row.finishType,
      row.firstSituation,
      row.firstEval,
      row.previousYearEval,
      row.currentSituation,
      row.structEval,
      row.impactEval,
      row.totalEval,
    ].some(value => String(value || '').trim())
  );

  setIsSending(true);

  try {
    const result = await gasApi("uploadInspectionReport", {
      spreadsheetId,
      stationNo,
      stationName,
      year: selectedYear,
      contractor,
      inspectDate,
      inspector,
      rows: rows.map(row => ({
        ...row,
        evalFontColors: {
          structEval: getEvalFontColor('structEval', row.structEval),
          totalEval: getEvalFontColor('totalEval', row.totalEval),
        },
      })),
    });

    if (result.success) {
      alert("施設点検報告書をスプレッドシートへ反映しました");
    } else {
      alert("施設点検報告書の反映に失敗しました: " + (result.error || "不明なエラー"));
    }
  } catch (e) {
    console.error(e);
    alert(`施設点検報告書の反映に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setIsSending(false);
  }
}


async function loadInspectionReport() {
  if (!spreadsheetId) return;

  const loadId = inspectionReportLoadIdRef.current + 1;
  inspectionReportLoadIdRef.current = loadId;

  setStationNo("");
  setFirstDate("");
  setInspectDate("");
  setContractor("");
  setFirstInspector("");
  setInspector("");
  setInspectionReportRows(createEmptyInspectionReportRows());
  setIsLoading(true);

  try {
    const allRows: InspectionReportRow[] = [];
    let offset = 0;
    const limit = 5;
    let hasMore = true;
    let mergedInspectDate = "";
    let mergedInspector = "";

    while (hasMore) {
      const result = await gasApi("getInspectionReportData", {
        spreadsheetId,
        masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
        routeName: selectedRoute,
        station: stationName,
        stationNo,
        year: selectedYear,
        offset,
        limit,
      });

      if (!result.success) {
        alert("施設点検報告書の読み込みに失敗しました");
        return;
      }

      if (inspectionReportLoadIdRef.current !== loadId) return;

      const header = toRecord(result.header);
      if (offset === 0) {
        if (header.stationNo !== undefined) setStationNo(String(header.stationNo || ''));
        if (header.stationName !== undefined && String(header.stationName || '').trim()) setStationName(String(header.stationName));
        if (header.contractor !== undefined) setContractor(String(header.contractor || ''));
      }

      mergedInspectDate = mergeUniqueMultilineText(mergedInspectDate, header.inspectDate);
      mergedInspector = mergeUniqueMultilineText(mergedInspector, header.inspector);

      setInspectDate(mergedInspectDate);
      setInspector(mergedInspector);

      const pageRows = Array.isArray(result.rows)
        ? result.rows.map((row: Partial<InspectionReportRow>, index: number) =>
            normalizeInspectionReportRow(row, allRows.length + index)
          )
        : [];

      allRows.push(...pageRows);
      const minRows = createEmptyInspectionReportRows(
        Math.max(23 - allRows.length, 0),
        allRows.length
      );
      setInspectionReportRows([...allRows, ...minRows]);

      offset = Number(result.nextOffset);
      hasMore =
        Boolean(result.hasMore) &&
        pageRows.length > 0 &&
        Number.isFinite(offset);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.toLowerCase().includes("unknown action")) {
      await loadInspectionReportLegacy(loadId);
      return;
    }
    console.error(e);
    alert(`施設点検報告書の読み込みに失敗しました: ${message}`);
  } finally {
    if (inspectionReportLoadIdRef.current === loadId) {
      setIsLoading(false);
    }
  }
};
async function loadInspectionReportLegacy(loadId: number) {
  const dateResult = await gasApi("getInspectionListDates", {
    masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
    routeName: selectedRoute,
    station: stationName,
    year: selectedYear,
  });

  if (inspectionReportLoadIdRef.current !== loadId) return;

  if (dateResult.stationNo !== undefined) setStationNo(String(dateResult.stationNo || ''));
  setInspectDate(formatSheetDateText(dateResult.latestDate));

  const listResult = await gasApi("getKarteList", {
    spreadsheetId,
    type: "photo",
  });

  const list = Array.isArray(listResult.list)
    ? listResult.list.map((no: unknown) => String(no || '').trim()).filter(Boolean)
    : [];

  if (inspectionReportLoadIdRef.current !== loadId) return;

  const headerKarteNo = list.includes('1') ? '1' : list[0];

  if (headerKarteNo) {
    const karteResult = await gasApi("getKarteData", {
      spreadsheetId,
      karteNo: headerKarteNo,
      station: stationName,
      year: selectedYear,
      routeFolderId,
    });

    if (inspectionReportLoadIdRef.current !== loadId) return;

    if (karteResult.success && karteResult.data) {
      const data = karteResult.data;
      setContractor(String(data.contractor || ''));
      setInspectDate(formatSheetDateText(data.inspectDate));
      setInspector(String(data.inspector || ''));
    }
  }

  if (inspectionReportLoadIdRef.current !== loadId) return;

  const rows = list.map((no: string, index: number) => normalizeInspectionReportRow({
    photoNo: no,
  }, index));

  const minRows = createEmptyInspectionReportRows(
    Math.max(23 - rows.length, 0),
    rows.length
  );
  setInspectionReportRows([...rows, ...minRows]);
}
const loadSlopeTable = async () => {
  setIsLoading(true);

  try {
const result = await gasApi("getSlopeTableData", {
  spreadsheetId,
  stationName,
  year: selectedYear,
  routeName: selectedRoute,
});

    if (!result.success) {
      alert("傾斜表の読み込みに失敗しました");
      return;
    }

    if (result.stationNo !== undefined && result.stationNo !== null && String(result.stationNo).trim()) {
      setStationNo(String(result.stationNo));
    }
    if (result.firstDate !== undefined && result.firstDate !== null && String(result.firstDate).trim()) {
      setFirstDate(formatSheetDateText(result.firstDate));
    }
    if (result.inspectDate !== undefined && result.inspectDate !== null && String(result.inspectDate).trim()) {
      setInspectDate(formatSheetDateText(result.inspectDate));
    }
    try {
      const masterDates = await fetchInspectionListDates();
      applyInspectionListDates(masterDates);
    } catch (e) {
      console.warn("点検リスト_マスタの日付取得に失敗しました", e);
    }
    if (result.evalType !== undefined && result.evalType !== null) {setEvalType(String(result.evalType));}
    const nextInspectList = Array.isArray(result.inspectList) ? result.inspectList : [];
    setInspectList(nextInspectList);

    const loadedSlopeRows = Array.isArray(result.rows)
      ? result.rows.map((row: Partial<SlopeTableRow>, index: number) => normalizeSlopeRow(row, index))
      : createEmptySlopeRows();

    setSlopeRows(padSlopeRowsForDisplay(loadedSlopeRows, nextInspectList));

    if (mode === 'inclination_menu') {
      try {
const inclination = await gasApi("getInclinationKarteSheets", {
  spreadsheetId,
  folderId: stationFolderId,
  year: selectedYear,
});

if (inclination.success) {

  const hasInclinationData =
    Array.isArray(inclination.rows) &&
    inclination.rows.some((row: any) => row.point);

  if (inclination.header) {
    setEvalType(
      hasInclinationData
        ? String(inclination.header.evalType || '')
        : ''
    );

  if (
    inclination.header.firstContractor !== undefined &&
    inclination.header.firstContractor !== null &&
    String(inclination.header.firstContractor).trim()
  ) {
    setSlopeFirstContractor(String(inclination.header.firstContractor));
  }
            if (inclination.header.firstInspector !== undefined && inclination.header.firstInspector !== null && String(inclination.header.firstInspector).trim()) {
              setSlopeFirstInspector(String(inclination.header.firstInspector));
            }
            setContractor(String(inclination.header.contractor || contractor));
            setInspector(String(inclination.header.inspector || inspector));
          }

if (Array.isArray(inclination.rows) && inclination.rows.length > 0) {

const byPoint = new Map<string, Partial<SlopeTableRow>>(
  inclination.rows.map((row: Partial<SlopeTableRow>) => [
    String(row.point || '').trim(),
    row
  ])
);

  setSlopeRows((rows: SlopeTableRow[]) =>
    rows.map((row: SlopeTableRow) => {

      const saved = byPoint.get(row.point.trim());

      if (!saved) return row;

      return {
        ...row,
        photo1: saved.photo1,
        photo2: saved.photo2,
        id: row.id,
      };
    })
  );
}
        }
      } catch (e) {
        console.warn("傾斜測定カルテの保存済みデータ取得をスキップしました", e);
      }
    }

  } catch (e) {
    if (isMissingSlopeTableError(e)) {
      setSlopeRows(createEmptySlopeRows());
      setInspectList([]);
      return;
    }

    console.error(e);
    alert("傾斜表の読み込みに失敗しました");

  } finally {

    setIsLoading(false);

  }

};

const updateSlopeRow = (
  rowId: number,
  field: keyof Omit<SlopeTableRow, 'id'>,
  value: string
) => {
  setSlopeRows(rows =>
    rows.map(row => {

      if (row.id !== rowId) return row;

      const updated = {
        ...row,
        [field]: value
      };
      // 初回 東西
      if (
        field === 'firstEwValue' &&
        (value === '0' || value === '0.0')
      ) {
        updated.firstEwDirection = '東西';
      }

      // 初回 南北
      if (
        field === 'firstNsValue' &&
        (value === '0' || value === '0.0')
      ) {
        updated.firstNsDirection = '南北';
      }

      // 最新 東西
      if (
        field === 'currentEwValue' &&
        (value === '0' || value === '0.0')
      ) {
        updated.currentEwDirection = '東西';
      }

      // 最新 南北
      if (
        field === 'currentNsValue' &&
        (value === '0' || value === '0.0')
      ) {
        updated.currentNsDirection = '南北';
      }

      return updated;
    })
  );
};

const getNextPointLabel = (value: string, offset: number) => {
  const text = value.trim().toUpperCase();
  if (!/^[A-Z]$/.test(text)) return '';

  const nextCode = text.charCodeAt(0) + offset;
  return nextCode <= 90 ? String.fromCharCode(nextCode) : '';
};

const updateSlopePoint = (rowId: number, value: string) => {
  setSlopeRows(rows => {
    const rowIndex = rows.findIndex(row => row.id === rowId);
    if (rowIndex === -1) return rows;

    const upperValue = value.toUpperCase();

    return rows.map((row, index) => {

      // 入力した行
      if (index === rowIndex) {
        return {
          ...row,
          point: upperValue
        };
      }

      // 次の1行だけ自動入力
      if (index === rowIndex + 1 && !row.point.trim()) {
        const nextLabel = getNextPointLabel(upperValue, 1);

        return {
          ...row,
          point: nextLabel
        };
      }

      return row;
    });
  });
};

const isSlopeAlertValue = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 10.1;
};

const normalizeSlopeNumber = (value: string) => {
  if (!value.trim()) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : value;
};

const hasSlopeValueDiff = (firstValue: string, currentValue: string) => {
  if (!firstValue.trim() || !currentValue.trim()) return false;

  const firstNumber = Number(firstValue);
  const currentNumber = Number(currentValue);
  if (Number.isFinite(firstNumber) && Number.isFinite(currentNumber)) {
    return firstNumber !== currentNumber;
  }

  return firstValue.trim() !== currentValue.trim();
};

const hasSlopeDiff = (row: SlopeTableRow, direction: 'ew' | 'ns') => {
  return direction === 'ew'
    ? hasSlopeValueDiff(row.firstEwValue, row.currentEwValue)
    : hasSlopeValueDiff(row.firstNsValue, row.currentNsValue);
};

const getSlopeNoteValue = (row: SlopeTableRow) => {
  const changed =
    hasSlopeDiff(row, 'ew') ||
    hasSlopeDiff(row, 'ns');

  if (changed) {
    return '変化あり';
  }

  return row.note === '変化あり'
    ? ''
    : row.note;
};

const getSlopePointClass = (row: SlopeTableRow) => {

  const hasAlert = [
    row.firstEwValue,
    row.firstNsValue,
    row.currentEwValue,
    row.currentNsValue,
  ].some(isSlopeAlertValue);

  return hasAlert ? 'text-red-600' : 'text-black';
};

const getSlopeCellStyle = (
  row: SlopeTableRow,
  field: keyof NonNullable<SlopeTableRow['cellStyles']>,
  fallbackBackgroundColor?: string
): React.CSSProperties => {
  const source = row.cellStyles?.[field];
  return {
    ...(fallbackBackgroundColor
      ? { backgroundColor: fallbackBackgroundColor }
      : source?.backgroundColor
        ? { backgroundColor: source.backgroundColor }
        : {}),
  };
};

const getSlopeValueClass = (value: string, isChanged = false) => {
  const classes = ['border-r border-slate-500 px-2 py-2 text-center outline-none'];

  if (isChanged) classes.push('bg-slate-200');
  if (isSlopeAlertValue(value)) classes.push('text-red-600');
  else classes.push('text-black');

  return classes.join(' ');
};

const addSlopeRow = () => {
  setSlopeRows(rows => [
    ...rows,
    {
  id: Date.now(),
  slopeType: '',
  point: '',
  place: '',
  placeSide: '',
  firstEwDirection: '',
  firstEwValue: '',
  firstNsDirection: '',
  firstNsValue: '',
  currentEwDirection: '',
  currentEwValue: '',
  currentNsDirection: '',
  currentNsValue: '',
  note: '',
  photo1: null,
  photo2: null,
},
  ]);
};

const updateSlopePhoto = (
  rowId: number,
  photoField: 'photo1' | 'photo2',
  photo: string | null
) => {

  setSlopeRows(rows =>
    rows.map(row =>
      row.id === rowId
        ? {
            ...row,
            [photoField]: photo,
          }
        : row
    )
  );

};

const handleSlopeCapture = async (
  e: React.ChangeEvent<HTMLInputElement>,
  rowId: number,
  photoField: 'photo1' | 'photo2'
) => {

  const file = e.target.files?.[0];
  e.target.value = "";

  if (!file) return;

  try {
    const compressed = await resizePhotoFile(
      file,
      900,
      1000000,
      0.3,
      1000000
    );

    updateSlopePhoto(
      rowId,
      photoField,
      compressed
    );
  } catch (error) {
    alert(
      "写真を読み込めませんでした。JPEG、PNG、HEIC/HEIF形式の写真を選択してください。" +
      (error instanceof Error ? `\n${error.message}` : "")
    );
  }

};

const sendSlopeTable = async () => {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (isSending) return;

  const rows = slopeRows.filter(row =>
    [
      row.point,
      row.place,
      row.firstEwValue,
      row.firstNsValue,
      row.currentEwValue,
      row.currentNsValue,
      row.note,
    ].some(value => value.trim())
  ).map(row => ({
    ...row,
    firstEwValue: formatSlopeDisplayNumber(row.firstEwValue),
    firstNsValue: formatSlopeDisplayNumber(row.firstNsValue),
    currentEwValue: formatSlopeDisplayNumber(row.currentEwValue),
    currentNsValue: formatSlopeDisplayNumber(row.currentNsValue),
    firstEw: formatSlopeDisplayNumber(row.firstEwValue),
    firstNs: formatSlopeDisplayNumber(row.firstNsValue),
    currentEw: formatSlopeDisplayNumber(row.currentEwValue),
    currentNs: formatSlopeDisplayNumber(row.currentNsValue),
    note: getSlopeNoteValue(row),
  }));

  setIsSending(true);

  try {
    const result = await gasApi("uploadSlopeTable", {
      spreadsheetId,
      stationNo,
      station: stationName,
      year: selectedYear,
      firstDate: formatSheetDateText(firstDate),
      inspectDate: formatSheetDateText(inspectDate),
      rows,
    });

    if (result.success) {
      alert("傾斜表をスプレッドシートへ保存しました");
    } else {
      alert("保存に失敗しました: " + (result.error || "不明なエラー"));
    }
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    alert(`傾斜表の保存に失敗しました: ${message || "不明なエラー"}`);
  } finally {
    setIsSending(false);
  }
};

const toPhotoPayload = async (photo: string | null | undefined, point: string, kind: 'first' | 'current') => {
  if (!photo) return null;
  const fileName = kind === 'first' ? `初回_${point}.jpg` : `${selectedYear}_${point}.jpg`;

  if (!photo.startsWith("data:image")) {
    const fileId =
      photo.match(/[?&]id=([^&#]+)/)?.[1] ||
      photo.match(/\/d\/([^/]+)/)?.[1] ||
      photo.match(/\/file\/d\/([^/]+)/)?.[1] ||
      "";
    if (!fileId) {
      throw new Error(`${point} の写真ファイルIDを取得できませんでした`);
    }

    return {
      point,
      kind,
      fileName,
      fileId: decodeURIComponent(fileId),
    };
  }

  const resized = await resizeImage(photo, 800, 350000, 0.4, 490000);
  const base64 = resized.includes(',') ? resized.split(',')[1] : "";
  if (!base64) {
    throw new Error(`${point} の写真データを作成できませんでした`);
  }

  return {
    point,
    kind,
    fileName,
    base64,
  };
};

const sendInclinationKarte = async () => {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (isSending) return;

  const filledRows = getFilledSlopeRows(slopeRows);
  if (filledRows.length === 0) return alert("傾斜表に測点が入力されていません");

  setIsSending(true);

  try {
    const inclinationGroups = chunkSlopeRows(slopeRows);
    const rows = filledRows.map(row => {
      const { photo1, photo2, ...rowWithoutPhotos } = row;
      return {
        ...rowWithoutPhotos,
        firstEwValue: formatSlopeDisplayNumber(row.firstEwValue),
        firstNsValue: formatSlopeDisplayNumber(row.firstNsValue),
        currentEwValue: formatSlopeDisplayNumber(row.currentEwValue),
        currentNsValue: formatSlopeDisplayNumber(row.currentNsValue),
      };
    });

    const result = await gasApi("uploadInclinationKarteSheets", {
      spreadsheetId,
      folderId: stationFolderId,
      stationNo,
      station: stationName,
      year: selectedYear,
      rangeLabel: getSlopeRangeLabel(inclinationGroups[inclinationPageIndex] || []),
      evalType,
      firstDate: formatSheetDateText(firstDate),
      firstContractor: slopeFirstContractor,
      firstInspector: slopeFirstInspector,
      inspectDate: formatSheetDateText(inspectDate),
      contractor,
      inspector,
      rows,
    });

    if (!result.success) {
      alert("保存に失敗しました: " + (result.error || "不明なエラー"));
      return;
    }

    const createdSheetNames = Array.isArray(result.sheetNames)
      ? result.sheetNames.map((name: unknown) => String(name || ''))
      : [];

    for (const [groupIndex, group] of inclinationGroups.entries()) {
      const sheetName = createdSheetNames[groupIndex] || getSlopeRangeLabel(group);
      let uploadedPhotoCount = 0;

      for (const row of group) {
        const firstPhotoFile = await toPhotoPayload(row.photo1, row.point, 'first');
        if (firstPhotoFile) {
          try {
            await gasApi("uploadInclinationKartePhoto", {
              spreadsheetId,
              folderId: stationFolderId,
              year: selectedYear,
              sheetName,
              point: row.point,
              kind: 'first',
              photoFile: firstPhotoFile,
            });
          } catch (error) {
            throw new Error(`${sheetName} / ${row.point} の初回写真貼り付けに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
          }
          uploadedPhotoCount += 1;
        } else {
          await gasApi("uploadInclinationKartePhoto", {
            spreadsheetId,
            folderId: stationFolderId,
            year: selectedYear,
            sheetName,
            point: row.point,
            kind: 'first',
            clear: true,
          });
        }

        const currentPhotoFile = await toPhotoPayload(row.photo2, row.point, 'current');
        if (currentPhotoFile) {
          try {
            await gasApi("uploadInclinationKartePhoto", {
              spreadsheetId,
              folderId: stationFolderId,
              year: selectedYear,
              sheetName,
              point: row.point,
              kind: 'current',
              photoFile: currentPhotoFile,
            });
          } catch (error) {
            throw new Error(`${sheetName} / ${row.point} の最新写真貼り付けに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
          }
          uploadedPhotoCount += 1;
        } else {
          await gasApi("uploadInclinationKartePhoto", {
            spreadsheetId,
            folderId: stationFolderId,
            year: selectedYear,
            sheetName,
            point: row.point,
            kind: 'current',
            clear: true,
          });
        }
      }

      if (uploadedPhotoCount === 0 && group.some(row => row.photo1 || row.photo2)) {
        throw new Error(`${sheetName} の写真データを送信できませんでした`);
      }
    }

    alert("傾斜測定カルテをスプレッドシートへ保存しました");
  } catch (e) {
    console.error(e);
    alert(`傾斜測定カルテの保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    setIsSending(false);
  }
};

const formatSizeDetailValue = (value: string) => {
  return value
    .split('\n')
    .map(line => {
      const text = line.trim();
      if (!text || /^(W|L|A)=/.test(text)) return line;

      const areaMatch = text.match(/^(\d+(?:\.\d+)?)\s*[*＊×xX]\s*(\d+(?:\.\d+)?)$/);
      if (areaMatch) return `A= ${areaMatch[1]} ×${areaMatch[2]}㎝`;

      if (/^\d+\.\d+$/.test(text)) return `W= ${text}㎜`;
      if (/^\d+$/.test(text)) return `L= ${text}㎝`;

      return line;
    })
    .join('\n');
};

if (mode === 'slope_table') {
  const slopeGridColumns = '78px 64px 58px 170px 54px 82px 54px 82px 54px 82px 54px 82px 90px';

  return (
    <div className="flex min-h-screen flex-col bg-slate-300 text-black" style={routePageStyle}>
      <Nav />
      <LoadingOverlay />

      <div className="mx-auto w-full max-w-[99%] flex-1 overflow-x-auto px-2 pb-24">

        <div className="min-w-[1100px] border-2 border-slate-900 bg-white text-[13px] shadow-sm">
          <div className="grid grid-cols-[1fr_120px_120px] border-b-2 border-slate-900">
            <div className="flex items-center justify-center border-r-2 border-slate-900 py-4 text-[22px] font-black tracking-[0.28em]">
              建 物 傾 斜 測 定 結 果 表
            </div>
            <div className="flex items-center justify-center border-r-2 border-slate-900 bg-slate-50 font-bold">
              駅No.
            </div>
            <input
              className="w-full px-3 text-center font-black outline-none"
              value={stationNo}
              onChange={e => setStationNo(e.target.value)}
              placeholder="駅No."
            />
          </div>

          <div
            className="grid border-b-2 border-slate-900 bg-slate-100 text-center font-black"
            style={{ gridTemplateColumns: slopeGridColumns }}
          >
            <div className="row-span-3 flex items-center justify-center whitespace-pre-line border-r-2 border-slate-900">
              傾斜{"\n"}種類
            </div>
            <div className="row-span-3 flex items-center justify-center border-r-2 border-slate-900">
              測点
            </div>
            <div className="col-span-2 row-span-3 flex items-center justify-center border-r-2 border-slate-900">
              測定箇所
            </div>
            <div className="col-span-4 border-r-2 border-slate-900 p-1">
              <div className="mb-1">初回点検日</div>
              <input
                className="w-full border border-slate-300 bg-white px-2 py-1 text-center font-normal outline-none"
                value={firstDate}
                onChange={e => setFirstDate(e.target.value)}
                placeholder="日付"
              />
            </div>
            <div className="col-span-4 border-r-2 border-slate-900 p-1">
  <div className="mb-1">点検日</div>

  <input
    className="w-full border border-slate-300 bg-white px-2 py-1 text-center font-normal outline-none"
    value={inspectDate}
    onChange={e => setInspectDate(e.target.value)}
    placeholder="日付"
  />
</div>
            <div className="row-span-3 flex items-center justify-center">
              備考
            </div>

            <div className="col-span-2 border-r border-t-2 border-slate-900 p-2">東西方向</div>
            <div className="col-span-2 border-r-2 border-t-2 border-slate-900 p-2">南北方向</div>
            <div className="col-span-2 border-r border-t-2 border-slate-900 p-2">東西方向</div>
            <div className="col-span-2 border-r-2 border-t-2 border-slate-900 p-2">南北方向</div>

            <div className="border-r border-t border-slate-900 p-2">方角</div>
            <div className="border-r border-t border-slate-900 p-2">測定値(mm)</div>
            <div className="border-r border-t border-slate-900 p-2">方角</div>
            <div className="border-r-2 border-t border-slate-900 p-2">測定値(mm)</div>
            <div className="border-r border-t border-slate-900 p-2">方角</div>
            <div className="border-r border-t border-slate-900 p-2">測定値(mm)</div>
            <div className="border-r border-t border-slate-900 p-2">方角</div>
            <div className="border-r-2 border-t border-slate-900 p-2">測定値(mm)</div>
          </div>

          <div>
            {slopeRows.map(row => {
              const ewChanged = hasSlopeDiff(row, 'ew');
              const nsChanged = hasSlopeDiff(row, 'ns');
              const noteValue = getSlopeNoteValue(row);
              return (
              <div
                key={row.id}
                className="grid border-b border-slate-500"
                style={{ gridTemplateColumns: slopeGridColumns }}
              >
                <select
  className="border-r border-slate-500 bg-white px-2 py-2 text-center outline-none"
  value={row.slopeType}
  onChange={e => updateSlopeRow(row.id, 'slopeType', e.target.value)}
>
  <option value=""></option>
  <option value="傾斜">傾斜</option>
  <option value="水平">水平</option>
</select>
                <input
                  className={`border-r border-slate-500 px-2 py-2 text-center outline-none ${getSlopePointClass(row)}`}
                  style={getSlopeCellStyle(row, 'point')}
                  value={row.point}
                  onChange={e => updateSlopePoint(row.id, e.target.value)}
                  maxLength={1}
                />
                <select
  className="border-r border-slate-500 bg-slate-50 px-2 py-2 text-center outline-none"
  value={row.placeSide}
  onChange={e => updateSlopeRow(row.id, 'placeSide', e.target.value)}
>
  <option value=""></option>
  <option value="外部">外部</option>
  <option value="内部">内部</option>
</select>

<div className="relative border-r border-slate-500">
  <input
    className="w-full px-2 py-2 outline-none"
    style={getSlopeCellStyle(row, 'place')}
    value={row.place}
    onChange={e => {
      updateSlopeRow(row.id, 'place', e.target.value);
      setActivePlaceRowId(row.id);
    }}
    onFocus={() => setActivePlaceRowId(row.id)}
    onBlur={() => {
    setTimeout(() => {
      setActivePlaceRowId(null);
    }, 200);
  }}
    placeholder="測定箇所"
  />

  {activePlaceRowId === row.id && buildingCategoryOptions.length > 0 && (
    <div className="absolute left-0 top-full z-50 max-h-48 w-full overflow-y-auto border border-slate-300 bg-white shadow-lg">
      {buildingCategoryOptions
        .filter(option =>
          option.includes(row.place)
        )
        .map(option => (
          <button
            key={option}
            type="button"
            className="block w-full border-b border-slate-100 px-2 py-2 text-left hover:bg-slate-100"
            onClick={() => {
              updateSlopeRow(row.id, 'place', option);
              setActivePlaceRowId(null);
            }}
          >
            {option}
          </button>
        ))}
    </div>
  )}
</div>
                <select
                  className={`border-r border-slate-500 bg-white px-1 py-2 text-center outline-none ${isSlopeAlertValue(row.firstEwValue) ? 'text-red-600' : 'text-black'}`}
                  style={getSlopeCellStyle(row, 'firstEwDirection')}
                  value={row.firstEwDirection}
                  onChange={e => updateSlopeRow(row.id, 'firstEwDirection', e.target.value)}
                >
                  <option value=""></option>
                  <option value="東">東</option>
                  <option value="西">西</option>
                  <option value="東西">東西</option>
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={getSlopeValueClass(row.firstEwValue)}
                  style={getSlopeCellStyle(row, 'firstEwValue')}
                  value={row.firstEwValue}
                  onChange={e => updateSlopeRow(row.id, 'firstEwValue', e.target.value)}
                  onBlur={e => updateSlopeRow(row.id, 'firstEwValue', normalizeSlopeNumber(e.target.value))}
                />
                <select
                  className={`border-r border-slate-500 bg-white px-1 py-2 text-center outline-none ${isSlopeAlertValue(row.firstNsValue) ? 'text-red-600' : 'text-black'}`}
                  style={getSlopeCellStyle(row, 'firstNsDirection')}
                  value={row.firstNsDirection}
                  onChange={e => updateSlopeRow(row.id, 'firstNsDirection', e.target.value)}
                >
                  <option value=""></option>
                  <option value="南">南</option>
                  <option value="北">北</option>
                  <option value="南北">南北</option>
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={getSlopeValueClass(row.firstNsValue)}
                  style={getSlopeCellStyle(row, 'firstNsValue')}
                  value={row.firstNsValue}
                  onChange={e => updateSlopeRow(row.id, 'firstNsValue', e.target.value)}
                  onBlur={e => updateSlopeRow(row.id, 'firstNsValue', normalizeSlopeNumber(e.target.value))}
                />
                <select
                  className={`border-r border-slate-500 bg-white px-1 py-2 text-center outline-none ${isSlopeAlertValue(row.currentEwValue) ? 'text-red-600' : 'text-black'}`}
                  style={getSlopeCellStyle(row, 'currentEwDirection')}
                  value={row.currentEwDirection}
                  onChange={e => updateSlopeRow(row.id, 'currentEwDirection', e.target.value)}
                >
                  <option value=""></option>
                  <option value="東">東</option>
                  <option value="西">西</option>
                  <option value="東西">東西</option>
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={getSlopeValueClass(row.currentEwValue, ewChanged)}
                  style={getSlopeCellStyle(row, 'currentEwValue', ewChanged ? '#e2e8f0' : '#ffffff')}
                  value={row.currentEwValue}
                  onChange={e => updateSlopeRow(row.id, 'currentEwValue', e.target.value)}
                  onBlur={e => updateSlopeRow(row.id, 'currentEwValue', normalizeSlopeNumber(e.target.value))}
                />
                <select
                  className={`border-r border-slate-500 bg-white px-1 py-2 text-center outline-none ${isSlopeAlertValue(row.currentNsValue) ? 'text-red-600' : 'text-black'}`}
                  style={getSlopeCellStyle(row, 'currentNsDirection')}
                  value={row.currentNsDirection}
                  onChange={e => updateSlopeRow(row.id, 'currentNsDirection', e.target.value)}
                >
                  <option value=""></option>
                  <option value="南">南</option>
                  <option value="北">北</option>
                  <option value="南北">南北</option>
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={getSlopeValueClass(row.currentNsValue, nsChanged)}
                  style={getSlopeCellStyle(row, 'currentNsValue', nsChanged ? '#e2e8f0' : '#ffffff')}
                  value={row.currentNsValue}
                  onChange={e => updateSlopeRow(row.id, 'currentNsValue', e.target.value)}
                  onBlur={e => updateSlopeRow(row.id, 'currentNsValue', normalizeSlopeNumber(e.target.value))}
                />
                <input
                  className="px-2 py-2 outline-none"
                  value={noteValue}
                  onChange={e => updateSlopeRow(row.id, 'note', e.target.value)}
                  readOnly={ewChanged || nsChanged}
                  placeholder="備考"
                />
              </div>
            )})}
          </div>

          <div className="border-t-2 border-slate-900 px-3 py-2 text-[12px] font-bold">
            *測定値については±1mmの範囲で測定誤差の生じる場合があります。
          </div>
        </div>

<div className="mt-4 flex flex-wrap justify-center gap-3">
  <button
    type="button"
    onClick={addSlopeRow}
    disabled={isSending}
    className="w-[220px] rounded-xl border-2 border-blue-600 bg-white py-4 text-lg font-black text-blue-700 shadow active:scale-95 disabled:border-slate-300 disabled:text-slate-400"
  >
    行を増やす
  </button>
  <button
    type="button"
    onClick={sendSlopeTable}
    disabled={isSending}
    className="w-[420px] rounded-xl bg-blue-600 py-4 text-lg font-black text-white shadow active:scale-95 disabled:bg-slate-400"
  >
    {isSending ? "保存中..." : "この内容で傾斜表を更新"}
  </button>
</div>
      </div>
    </div>
  );
}

const buildRangeLabel = (list: string[]): string => {
  if (!list || list.length === 0) return "";

  const unique = [...new Set(list.map(v => v.trim()).filter(Boolean))];

  const len = unique.length;

  if (len === 1) return unique[0];
  if (len === 2) return `${unique[0]},${unique[1]}`;
  if (len === 3) return `${unique[0]}-${unique[2]}`;

  return `${unique[0]}-${unique[3] || unique[unique.length - 1]}`;
};

const getFilledSlopeRows = (rows: SlopeTableRow[]) =>
  rows.filter(row => row.point?.trim());

const chunkSlopeRows = (rows: SlopeTableRow[], size = 4) => {
  const filledRows = getFilledSlopeRows(rows);
  const chunks: SlopeTableRow[][] = [];

  for (let index = 0; index < filledRows.length; index += size) {
    chunks.push(filledRows.slice(index, index + size));
  }

  return chunks;
};

const getSlopeRangeLabel = (rows: SlopeTableRow[]) =>
  buildRangeLabel(rows.map(row => row.point));

  const applyDriveBrowserResult = (result: Record<string, unknown>) => {
    const currentFolder = result.currentFolder as DriveFolderItem | null | undefined;
    const path = Array.isArray(result.folderPath)
      ? result.folderPath
          .map(item => toRecord(item).name)
          .map(name => String(name || '').trim())
          .filter(Boolean)
          .join(' / ')
      : '';

    setDriveMaps(Array.isArray(result.list) ? result.list as DriveMapItem[] : []);
    setDriveFolders(Array.isArray(result.folders) ? result.folders as DriveFolderItem[] : []);
    setDriveCurrentFolder(currentFolder || null);
    setDriveParentFolder(result.parentFolder as DriveFolderItem | null || null);
    setDriveFolderPath(path || currentFolder?.name || '');
  };

  const loadDriveMapFolder = async (
    folderId?: string,
    routeNameOverride?: string,
    rememberPhotoFolder = drivePickerTarget.type !== 'map'
  ) => {
    setIsLoading(true);
    try {
      const result = await gasApi(
        "getMaps",
        folderId ? { folderId } : { routeName: routeNameOverride ?? selectedRoute }
      );

      applyDriveBrowserResult(result);
      if (rememberPhotoFolder && result.currentFolder?.id && typeof window !== 'undefined') {
        window.localStorage.setItem(PHOTO_DRIVE_LAST_FOLDER_STORAGE_KEY, String(result.currentFolder.id));
      }
      setShowMapPicker(true);
    } catch (e) {
      alert("ドライブの取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const openDrivePicker = (target: DrivePickerTarget, folderId?: string, routeNameOverride?: string) => {
    setDrivePickerTarget(target);

    if (target.type === 'map') {
      loadDriveMapFolder(undefined, "", false);
      return;
    }

    const rememberedFolderId =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(PHOTO_DRIVE_LAST_FOLDER_STORAGE_KEY)
        : "";
    loadDriveMapFolder(
      rememberedFolderId || folderId,
      routeNameOverride,
      true
    );
  };

  const handleDriveImageSelect = async (image: DriveMapItem) => {
    setIsLoading(true);
    try {
      const result = await gasApi("getMapBase64", { id: image.id });
      const base64 = String(result.base64 || "").trim();

      if (!base64) {
        throw new Error("Base64取得失敗");
      }

      const imageDataUrl = await convertHeicDataUrlToJpegIfNeeded(
        buildImageDataUrl(base64, result.mimeType)
      );
      const displayImageDataUrl = drivePickerTarget.type === 'map'
        ? imageDataUrl
        : await resizeImageWithHeicFallback(
            imageDataUrl,
            900,
            1000000,
            0.3,
            1000000
          );

      if (drivePickerTarget.type === 'map') {
        setSourceImage(displayImageDataUrl);
      } else if (drivePickerTarget.type === 'karteFirst') {
        setFirstPhotos(current => {
          const next = [...current];
          next[drivePickerTarget.index] = displayImageDataUrl;
          return next;
        });
        setFirstPhotoMarks(prev => prev.map((marks, index) => index === drivePickerTarget.index ? [] : marks));
      } else if (drivePickerTarget.type === 'karteCurrent') {
        setPhotos(current => {
          const next = [...current];
          next[drivePickerTarget.index] = displayImageDataUrl;
          return next;
        });
        setCurrentPhotoMarks(prev => prev.map((marks, index) => index === drivePickerTarget.index ? [] : marks));
      } else {
        updateSlopePhoto(drivePickerTarget.rowId, drivePickerTarget.photoField, displayImageDataUrl);
      }

      setShowMapPicker(false);
    } catch (e) {
      alert("読込失敗");
    } finally {
      setIsLoading(false);
    }
  };

  const drivePickerTitle = drivePickerTarget.type === 'map'
    ? 'ドライブから位置図を選択'
    : 'ドライブから写真を選択';

  const drivePickerModal = showMapPicker ? (
    <div className="fixed inset-0 z-[300] flex flex-col bg-white animate-slide-up">
      <div className="shrink-0 border-b border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0">
            <h3 className="text-xl font-bold">{drivePickerTitle}</h3>
            <p className="mt-1 truncate text-sm font-bold text-slate-500">
              {driveFolderPath || driveCurrentFolder?.name || "初期フォルダ"}
            </p>
          </div>
          <button onClick={() => setShowMapPicker(false)} className="transition-all active:scale-95 active:brightness-90 text-2xl">✕</button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {driveParentFolder && (
            <button
              type="button"
              onClick={() => loadDriveMapFolder(driveParentFolder.id)}
              className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 active:scale-95"
            >
              ↑ 上のフォルダ
            </button>
          )}
          <button
            type="button"
            onClick={() => loadDriveMapFolder(
              drivePickerTarget.type === 'map' ? undefined : INSPECTION_DRIVE_ROOT_FOLDER_ID,
              drivePickerTarget.type === 'map' ? "" : undefined,
              drivePickerTarget.type !== 'map'
            )}
            className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 active:scale-95"
          >
            初期フォルダ
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-10 sm:p-6">
        <div className="mb-6">
          <div className="mb-2 text-xs font-black uppercase text-slate-400">フォルダ</div>
          {driveFolders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">
              このフォルダに下位フォルダはありません。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {driveFolders.map(folder => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => loadDriveMapFolder(folder.id)}
                  className="transition-all active:scale-95 active:brightness-90 flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-bold text-slate-700"
                >
                  <span className="text-xl">📁</span>
                  <span className="min-w-0 truncate text-sm">{folder.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-2 text-xs font-black uppercase text-slate-400">画像</div>
        {driveMaps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
            このフォルダに画像はありません。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {driveMaps.map(image => (
              <button
                key={image.id}
                type="button"
                onClick={() => handleDriveImageSelect(image)}
                className="transition-all active:scale-95 active:brightness-90 flex flex-col gap-2 p-2 bg-slate-50 rounded-xl active:bg-slate-200"
              >
                <img src={image.thumbUrl} className="w-full aspect-video object-cover rounded-lg shadow-sm" alt="" />
                <span className="text-[10px] font-bold text-slate-600 truncate w-full text-left">{image.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

// ========================================
// 傾斜測定カルテ
// ========================================
if (mode === 'inclination_menu') {
  const inclinationGroups = chunkSlopeRows(slopeRows);
  const selectedInclinationRows = inclinationGroups[inclinationPageIndex] || [];
  const currentInclinationRange = getSlopeRangeLabel(selectedInclinationRows);
  const inclinationScale = Math.min(
    1,
    Math.max(0.3, (viewportWidth - 32) / INCLINATION_CARD_WIDTH)
  );
  const scaledInclinationWidth = INCLINATION_CARD_WIDTH * inclinationScale;

  return (

  <div className="min-h-screen overflow-x-hidden bg-slate-100 p-4 text-black" style={routePageStyle}>

    <Nav />
    <LoadingOverlay />
    {drivePickerModal}

    <div
      className="mx-auto"
      style={{
        width: INCLINATION_CARD_WIDTH,
        maxWidth: INCLINATION_CARD_WIDTH,
        transform: `scale(${inclinationScale})`,
        transformOrigin: 'top left',
        marginLeft: inclinationScale < 1 ? `calc((100% - ${scaledInclinationWidth}px) / 2)` : undefined,
      }}
    >

{/* ヘッダーエリア */}
<div className="bg-white border-2 border-slate-800 mb-3">

  <div className="grid grid-cols-[160px_120px_140px_80px_1fr_80px_120px_120px]">

    {/* 写真カルテ */}
    <div className="border-r-2 border-slate-800 p-3 font-bold flex items-center justify-center bg-slate-200">
      写真カルテ
    </div>

{/* 傾斜範囲 */}
<div className="border-r-2 border-slate-800 p-3 flex items-center justify-center font-bold">
  {currentInclinationRange || (inspectList?.length > 0 ? buildRangeLabel(inspectList) : "")}
</div>

    {/* 駅No.- */}
    <div className="border-r-2 border-slate-800 p-2 flex items-center justify-center text-sm font-bold bg-slate-200">
      駅No.-
    </div>

    {/* 駅No（入力） */}
<div className="border-r-2 border-slate-800 p-2 flex items-center">
  <input
    className="w-full outline-none text-center font-bold"
    value={stationNo}
    onChange={(e) => setStationNo(e.target.value)}
    placeholder=""
  />
</div>

{/* 駅名 */}
<div className="border-r-2 border-slate-800 p-2 flex items-center">
  <input
    className="w-full outline-none text-center font-bold"
    value={stationName}
    onChange={(e) => setStationName(e.target.value)}
    placeholder=""
  />
</div>

{/* 駅ラベル */}
<div className="p-3 flex items-center justify-center font-bold bg-slate-200 border-r-2 border-slate-800">
  駅
</div>

{/* 評価区分（ラベル） */}
<div className="p-3 flex items-center justify-center font-bold bg-slate-200 border-r-2 border-slate-800">
  評価区分
</div>

{/* 評価区分（入力） */}
<div className="border-slate-800 p-2 flex items-center">
  <input
    className="w-full outline-none text-center font-bold"
    value={evalType}
    onChange={(e) => setEvalType(e.target.value)}
  />
</div>
</div>
</div>

{/* 傾斜ブロック */}
<div className="bg-white border-2 border-slate-800 mb-3">

  {/* タイトル（上段・中央） */}
  <div className="border-b border-slate-800 p-3 flex items-center justify-center font-bold bg-slate-200">
    建物傾斜測定
  </div>

  {/* テーブル部分 */}
  <div className="grid grid-cols-[120px_1fr_140px_140px_120px_1fr_140px_140px]">

    {/* 初回点検日 */}
    <div className="border-r border-slate-800 p-3 flex items-center justify-center font-bold bg-slate-200">
    初回点検日
    </div>

    {/* 初回 日付反映 */}
    <div className="border-r border-slate-800 p-2 flex items-center justify-center">
      {firstDate}
    </div>

    {/* 初回 受注者（入力） */}
<div className="border-r border-slate-800 p-2 flex items-center">
  <input
    type="text"
    className="w-full h-12 text-center text-sm outline-none"
    value={slopeFirstContractor}
    onChange={(e) => setSlopeFirstContractor(e.target.value)}
    placeholder="受注者"
  />
</div>

    {/* 初回 点検者（入力） */}
<div className="border-r border-slate-800 p-2 flex items-center">
  <input
    type="text"
    className="w-full h-12 text-center text-sm outline-none"
    value={slopeFirstInspector}
    onChange={(e) => setSlopeFirstInspector(e.target.value)}
    placeholder="点検者"
  />
</div>

    {/* 最新点検日 */}
   <div className="border-r border-slate-800 p-3 flex items-center justify-center font-bold bg-blue-700 text-white">
    最新点検日
    </div>

    {/* 最新 日付反映 */}
    <div className="border-r border-slate-800 p-2 flex items-center justify-center">
      {inspectDate}
    </div>

    {/* 最新 受注者（入力） */}
<div className="border-r border-slate-800 p-2 flex items-center">
  <textarea
    className="w-full text-center text-sm outline-none resize-none overflow-hidden"
    value={contractor}
    onChange={(e) => setContractor(e.target.value)}
    rows={2}
    placeholder="受注者"
  />
</div>

    {/* 最新 点検者（入力） */}
<div className="p-2 flex items-center">
  <textarea
    className="w-full text-center text-sm outline-none resize-none overflow-hidden"
    value={inspector}
    onChange={(e) => setInspector(e.target.value)}
    rows={2}
    placeholder="点検者"
  />
</div>

  </div>

</div>

{/* 傾斜測定ブロック */}
{inclinationGroups.length > 1 && (
  <div className="mb-3 flex flex-wrap gap-2">
    {inclinationGroups.map((group, index) => (
      <button
        key={getSlopeRangeLabel(group) || index}
        type="button"
        onClick={() => setInclinationPageIndex(index)}
        className={`rounded-lg border px-4 py-2 text-sm font-bold ${
          index === inclinationPageIndex
            ? 'border-blue-700 bg-blue-700 text-white'
            : 'border-slate-400 bg-white text-slate-700'
        }`}
      >
        {getSlopeRangeLabel(group)}
      </button>
    ))}
  </div>
)}

<div className="grid grid-cols-2 gap-4">

{selectedInclinationRows
  .map((row) => {

    const ewChanged = hasSlopeDiff(row, 'ew');
    const nsChanged = hasSlopeDiff(row, 'ns');

    return (

      <div
        key={row.id}
        className="bg-white border-2 border-slate-800"
      >

        {/* タイトル */}
        <div className="border-b-2 border-slate-800">

          <div className="grid grid-cols-[100px_1fr]">

            <div className="bg-slate-200 border-r border-slate-800 p-2 text-center font-bold">
              測点
            </div>

            <div
              className={`p-2 text-center font-bold text-lg ${getSlopePointClass(row)}`}
              style={getSlopeCellStyle(row, 'point')}
            >
              {row.point}
            </div>

          </div>

        </div>

        {/* 点検日 */}
<div className="grid grid-cols-2 border-b border-slate-800">

  <div className="border-r border-slate-800">
    <div className="bg-slate-300 p-1 text-center text-xs font-bold">
      初回点検日
    </div>

    <div className="p-2 text-center">
      {firstDate}
    </div>
  </div>

  <div>
    <div className="bg-blue-700 text-white p-1 text-center text-xs font-bold">
      最新点検日
    </div>

    <div className="p-2 text-center">
      {inspectDate}
    </div>
  </div>

</div>

        {/* 点検場所 */}
        <div className="grid grid-cols-[90px_1fr] border-b border-slate-800">

          <div className="bg-slate-100 border-r border-slate-800 p-2 text-center font-bold">
            点検場所
          </div>

          <div className="p-2" style={getSlopeCellStyle(row, 'place')}>
            {row.place}
          </div>

        </div>

        {/* 測定値 */}
        <div className="grid grid-cols-2 border-b border-slate-800">

          {/* 初回 */}
          <div className="border-r border-slate-800">

            <div className="bg-slate-200 p-1 text-center font-bold">
              初回傾斜
            </div>

            <div className="grid grid-cols-[60px_1fr_60px_1fr] text-center">


              <div className={`${
                isSlopeAlertValue(row.firstEwValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'firstEwDirection')}>
                {row.firstEwDirection}
              </div>

              <div className={`${
                isSlopeAlertValue(row.firstEwValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'firstEwValue')}>
                {row.firstEwValue}
              </div>

              <div className={`${
                isSlopeAlertValue(row.firstNsValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'firstNsDirection')}>
                {row.firstNsDirection}
              </div>

              <div className={`${
                isSlopeAlertValue(row.firstNsValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'firstNsValue')}>
                {row.firstNsValue}
              </div>

            </div>

          </div>

          {/* 最新 */}
          <div>

            <div className="bg-blue-700 text-white p-1 text-center font-bold">
              最新傾斜
            </div>

            <div className="grid grid-cols-[60px_1fr_60px_1fr] text-center">

              <div className={`${
                isSlopeAlertValue(row.currentEwValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'currentEwDirection')}>
                {row.currentEwDirection}
              </div>

              <div className={`${
                ewChanged
                  ? 'bg-slate-300'
                  : ''
              } ${
                isSlopeAlertValue(row.currentEwValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'currentEwValue', ewChanged ? '#cbd5e1' : '#ffffff',)}>
                {row.currentEwValue}
              </div>

              <div className={`${
                isSlopeAlertValue(row.currentNsValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'currentNsDirection')}>
                {row.currentNsDirection}
              </div>

              <div className={`${
                nsChanged
                  ? 'bg-slate-300'
                  : ''
              } ${
                isSlopeAlertValue(row.currentNsValue)
                  ? 'text-red-600'
                  : ''
              }`} style={getSlopeCellStyle(row, 'currentNsValue', nsChanged ? '#cbd5e1' : '#ffffff')}>
                {row.currentNsValue}
              </div>

            </div>

          </div>

        </div>

{/* 写真２枚 */}
<div className="grid grid-cols-2 border-b border-slate-300">

  {/* 写真① */}
  <div className="relative aspect-[4/3] bg-slate-100">

    <div className="w-full h-full overflow-hidden">

      {row.photo1 ? (

        <img
          src={row.photo1}
          className="w-full h-full object-cover"
        />

      ) : (

        <div className="flex h-full items-center justify-center text-slate-400 text-sm">
          初回写真
        </div>

      )}

    </div>

    <input
      id={`slope-photo1-${row.id}`}
      type="file"
      accept="image/*"
      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      onChange={(e) =>
        handleSlopeCapture(e, row.id, 'photo1')
      }
    />

    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openDrivePicker({ type: 'slope', rowId: row.id, photoField: 'photo1' }, INSPECTION_DRIVE_ROOT_FOLDER_ID);
      }}
      className="absolute bottom-1 left-1 z-20 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow"
    >
      Drive
    </button>

    {!!row.photo1 && (

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updateSlopePhoto(row.id, 'photo1', null);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updateSlopePhoto(row.id, 'photo1', null);
        }}
        className="absolute top-1 right-1 z-30 w-6 h-6 rounded-full bg-red-600 text-white text-xs"
      >
        ✕
      </button>

    )}

  </div>

  {/* 写真② */}
  <div className="relative aspect-[4/3] bg-slate-100 border-l border-slate-300">

    <div className="w-full h-full overflow-hidden">

      {row.photo2 ? (

        <img
          src={row.photo2}
          className="w-full h-full object-cover"
        />

      ) : (

        <div className="flex h-full items-center justify-center text-slate-400 text-sm">
          最新写真
        </div>

      )}

    </div>

    <input
      id={`slope-photo2-${row.id}`}
      type="file"
      accept="image/*"
      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      onChange={(e) =>
        handleSlopeCapture(e, row.id, 'photo2')
      }
    />

    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openDrivePicker({ type: 'slope', rowId: row.id, photoField: 'photo2' }, INSPECTION_DRIVE_ROOT_FOLDER_ID);
      }}
      className="absolute bottom-1 left-1 z-20 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow"
    >
      Drive
    </button>

    {!!row.photo2 && (

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updateSlopePhoto(row.id, 'photo2', null);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updateSlopePhoto(row.id, 'photo2', null);
        }}
        className="absolute top-1 right-1 z-30 w-6 h-6 rounded-full bg-red-600 text-white text-xs"
      >
        ✕
      </button>

    )}

  </div>

</div>

      </div>

    );
  })}

</div>
<div className="mt-6 flex justify-center pb-10">
  <button
    type="button"
    onClick={sendInclinationKarte}
    disabled={isSending || inclinationGroups.length === 0}
    className="w-[460px] rounded-xl bg-blue-700 py-4 text-lg font-black text-white shadow active:scale-95 disabled:bg-slate-400"
  >
    {isSending ? "保存中..." : "この内容で傾斜測定カルテを更新"}
  </button>
</div>
      </div>
    </div>
  );
}

 if (mode === 'karte_menu') {
    const isPhoto = mode === 'karte_menu';
    return (
      <div className="flex flex-col items-center justify-start h-screen bg-slate-50 p-6 text-black" style={routePageStyle}>
        <Nav />
        <LoadingOverlay />
        <h2 className="text-2xl font-black mb-8">{isPhoto ? '写真カルテ' : '傾斜測定カルテ'}</h2>
        <div className="flex flex-col gap-6 w-full max-w-sm">
          {isPhoto && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center font-black text-amber-900">
              <div>スプレッドシート未保存 {unsavedPhotoKarteCount}件</div>
              <div className="mt-1 text-sm">あと{remainingUnsavedPhotoKarteCount}件作成できます</div>
              {unsavedPhotoKarteCount > 0 && (
                <button
                  type="button"
                  onClick={() => syncUnsavedPhotoKartes()}
                  disabled={isSending}
                  className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-white shadow-sm active:scale-95 disabled:bg-slate-300"
                >
                  {isSending ? "保存中..." : "未保存分をスプレッドシートへ保存"}
                </button>
              )}
            </div>
          )}

          {/* ① 新規作成ボタン */}
          <button 
            onClick={async () => {
              if (isPhoto && unsavedPhotoKarteCount >= UNSAVED_PHOTO_KARTE_LIMIT) {
                alert(`未保存カルテが${UNSAVED_PHOTO_KARTE_LIMIT}件あります。先にスプレッドシートへ保存してください。`);
                return;
              }

              resetKarteFields();
              setIsEditMode(false);

              if (isPhoto) {
                setIsLoading(true);
                try {
                  const available = await loadKarteNumberOptions();
                  if (available.length === 0) {
                    alert("使用できる写真カルテ番号がありません");
                    return;
                  }
                  setKarteNo(available[0]);
                  setMode('karte_edit');
                } catch (e) {
                  console.error(e);
                  alert("写真カルテ番号の取得に失敗しました");
                } finally {
                  setIsLoading(false);
                }
                return;
              }

              setMode('inclination_edit');
            }} 
            className="transition-all active:scale-95 active:brightness-90 py-8 bg-indigo-600 text-white rounded-3xl font-bold text-xl shadow-xl disabled:bg-slate-400"
            disabled={isLoading}
          >
            ① 新規の作成
          </button>

          {/* ② 作成済み修正ボタン */}
          <button 
            disabled={isLoading} 
            onClick={async () => {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  setIsLoading(true);
  try {
    const result = await gasApi("getKarteList", {
  spreadsheetId,
  type: isPhoto ? 'photo' : 'incl'
});
    if (result.success) {
      setExistingKartes(result.list);
      goTo("edit_list"); // 一旦リスト画面へ飛ばすのが親切です
    }
  } catch (e) {
    alert("通信エラーが発生しました");
  } finally {
    setIsLoading(false);
  }
}}
            className="transition-all active:scale-95 active:brightness-90 py-8 bg-white border-2 border-indigo-300 text-indigo-600 rounded-3xl font-bold text-xl shadow-xl flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-6 w-6 text-indigo-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                検索中...
              </>
            ) : (
              "② 作成済み修正"
            )}
          </button>
        </div>
      </div>
    );
  }
  if (mode === 'karte_edit' || mode === 'inclination_edit') {
    const isPhoto = mode === 'karte_edit';
    const hasCurrentPhoto = photos.some(photo => Boolean(photo));
    const photoKarteFirstDateOptions = Array.from(new Set([
      photoKarteStoredFirstDate,
      firstDate,
      ...photoKarteMasterDates.firstDates,
    ].map(value => String(value || '').trim()).filter(Boolean)));
    const finishOptions = getFinishOptions();
    const checkItems = getCheckItems();
    return (
      <div className="flex flex-col items-center justify-start min-h-screen bg-slate-300 text-black" style={routePageStyle}>
        <Nav />
        <LoadingOverlay />
        {drivePickerModal}

        {/* --- スプレッドシート再現ヘッダー (線の色を slate-800 で統一) --- */}
        <div className="w-full max-w-[99%] bg-white shadow-sm border-2 border-slate-800 mt-2 text-[15px]">
          {/* 1-2行目：タイトル、駅名、点検場所、年度、点検受注者 */}
          <div
            className="grid border-b-2 border-slate-800"
            style={{ gridTemplateColumns: '0.8fr 0.7fr 1.6fr 3.4fr 0.85fr 1.45fr' }}
          >
            <div className="border-r-2 border-slate-800 p-2 bg-slate-100 flex items-center justify-center font-bold">写真カルテ</div>
            <div className="border-r-2 border-slate-800 p-1 bg-white">
              {isPhoto ? (
                <select
                  className="w-full h-full outline-none px-1 text-center font-black text-black bg-white"
                  value={karteNo}
                  onChange={e => setKarteNo(e.target.value)}
                  disabled={isEditMode}
                >
                  {isEditMode && <option value={karteNo}>{karteNo}</option>}
                  {!isEditMode && availableKarteNumbers.map(no => (
                    <option key={no} value={no}>{no}</option>
                  ))}
                </select>
              ) : (
                <input 
                  className="w-full h-full outline-none px-1 text-center font-black text-black placeholder-slate-400" 
                  placeholder="No.入力" 
                  value={karteNo} 
                  onChange={e => setKarteNo(e.target.value)}
                />
              )}
            </div>
            <div className="border-r-2 border-slate-800 p-2 flex items-center px-4 font-black text-lg bg-white text-black min-w-0">
              <span className="truncate">{stationName || "未選択"} 駅</span>
            </div>
            <div className="border-r-2 border-slate-800 p-1 flex flex-col bg-white min-w-0">
              <span className="text-[9px] font-bold text-blue-700">点検場所の詳細</span>
              <div className="grid grid-cols-[1fr_1fr_1.25fr] gap-1">
                <select
                  className="w-full min-w-0 outline-none text-[17px] text-black bg-transparent"
                  value={buildingCategory}
                  onChange={e => setBuildingCategory(e.target.value)}
                >
                  <option value="">① 建物分類</option>
                  {buildingCategoryOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select
                  className="w-full min-w-0 outline-none text-[15px] text-black bg-transparent"
                  value={inspectionPlace}
                  onChange={e => setInspectionPlace(e.target.value)}
                >
                  <option value="">② 点検場所</option>
                  {inspectionPlaceOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <input
                  className="w-full min-w-0 outline-none text-[15px] text-black placeholder-slate-400 bg-transparent"
                  placeholder="③ 詳細"
                  value={locationDetail}
                  onChange={e => setLocationDetail(e.target.value)}
                />
              </div>
            </div>
            <div className="border-r-2 border-slate-800 p-2 bg-slate-100 flex items-center justify-center font-bold text-black italic text-sm">
              {selectedYear} 年度
            </div>
            <div className="p-1 flex flex-col bg-blue-50/30 min-w-0">
              <span className="text-[9px] font-bold text-blue-700">点検受注者</span>
              <input
                className="w-full outline-none text-[12px] text-black placeholder-slate-400 bg-transparent"
                placeholder="会社名"
                value={contractor}
                onChange={e => setContractor(e.target.value)}
              />
            </div>
          </div>

{/* 3-4行目：各評価項目 */}
<div className="grid grid-cols-12 bg-slate-100 font-bold text-center border-b border-slate-800">

  {/* タイトル */}
  <div className="col-span-1 border-r border-slate-800 p-2 flex items-center justify-center text-black">
    評価区分
  </div>

  {/* ① 構造度評価 */}
  <div className="col-span-2 border-r border-slate-800 bg-white p-1">
    <div className="text-[9px] text-black mb-1">
      ① 構造度評価
    </div>

    <select
      className="w-full outline-none text-center font-black bg-white text-black"
      value={structEval}
      onChange={(e) => setStructEval(e.target.value)}
    >
      <option value="">選択</option>
      <option value="AA">AA</option>
      <option value="A1">A1</option>
      <option value="A2">A2</option>
      <option value="B">B</option>
      <option value="C">C</option>
      <option value="S">S</option>
    </select>
  </div>

  {/* ② 影響度評価 */}
  <div className="col-span-2 border-r border-slate-800 bg-white p-1">
    <div className="text-[9px] text-black mb-1">
      ② 影響度評価
    </div>

    <select
      className="w-full outline-none text-center font-black bg-white text-black"
      value={impactEval}
      onChange={(e) => setImpactEval(e.target.value)}
    >
      <option value="">選択</option>
      <option value="〇">〇</option>
      <option value="△">△</option>
      <option value="☓">☓</option>
    </select>
  </div>

  {/* 総合評価 */}
  <div className="col-span-2 border-r border-slate-800 bg-white p-1">
    <div className="text-[9px] text-black mb-1">
      総合評価
    </div>

    <input
      readOnly
      value={totalEval}
      className={`w-full outline-none text-center font-black bg-white ${
        totalEval === 'AA' || totalEval === 'A1' || totalEval === 'A2' || totalEval === 'B'
          ? 'text-red-600'
          : 'text-black'
      }`}
    />
  </div>

  {/* 前年度評価 */}
  <div className="col-span-5 bg-white p-1">
    <div className="text-[9px] text-black mb-1">
      前年度評価
    </div>

    <select
      className="w-full outline-none text-center text-black bg-white font-normal"
      value={prevYearEval || ''}
      onChange={e => setPrevYearEval(e.target.value)}
    >
      <option value="">選択</option>
      <option value="AA">AA</option>
      <option value="A1">A1</option>
      <option value="A2">A2</option>
      <option value="B">B</option>
      <option value="C">C</option>
      <option value="S">S</option>
    </select>
  </div>

</div>

          </div>

        {/* --- メインコンテンツ：左右分割 (外枠を slate-800 で統一) --- */}
        <div className="w-full max-w-[99%] bg-white flex-1 grid grid-cols-2 divide-x-2 divide-slate-800 border-x-2 border-b-2 border-slate-800 mb-4 overflow-hidden">
          
          {/* 【左：初回点検内容（黒文字ベース）】 */}
          <div className="flex flex-col h-full bg-slate-50">
            <div className="bg-slate-700 text-white text-[10px] font-bold p-1 text-center uppercase tracking-widest">
               初回点検（過去参照・編集）
            </div>
            {/* 初回基本情報 */}
            <div className="grid grid-cols-[0.75fr_1fr_1fr] text-[11px] border-b border-slate-800">
            <div className="p-1 border-r border-slate-400 flex flex-col">
            <span className="text-[9px] font-bold text-black">初回カルテ番号</span>
            <input
            type="number"
            inputMode="numeric"
            className="bg-transparent outline-none placeholder-slate-400"
            placeholder="番号"
            value={firstKarteNo || ''}
            onChange={e => setFirstKarteNo(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="p-1 border-r border-slate-400 flex flex-col">
            <span className="text-[9px] font-bold text-black">初回点検日</span>
            {hasCurrentPhoto ? (
              <select
                className="min-h-5 bg-transparent outline-none text-black"
                value={firstDate}
                onChange={e => {
                  setFirstDate(e.target.value);
                  setPhotoKarteStoredFirstDate(e.target.value);
                }}
              >
                {photoKarteFirstDateOptions.length === 0 && (
                  <option value="">初回点検日なし</option>
                )}
                {photoKarteFirstDateOptions.map(date => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </select>
            ) : (
              <div className="min-h-5 whitespace-pre-wrap text-black">
                {firstDate}
              </div>
            )}
          </div>
          <div className="p-1 flex flex-col">
          <span className="text-[9px] font-bold text-black">初回点検者</span>
          {hasCurrentPhoto ? (
            <input
              type="text"
              className="bg-transparent outline-none placeholder-slate-400"
              placeholder="氏名"
              value={photoKarteStoredFirstInspector}
              onChange={e => {
                setPhotoKarteStoredFirstInspector(e.target.value);
                setFirstInspector(e.target.value);
              }}
            />
          ) : (
            <select
              className="bg-transparent outline-none text-black"
              value={photoKarteSelectedInspector}
              onChange={e => {
                setPhotoKarteSelectedInspector(e.target.value);
                setFirstInspector(e.target.value);
              }}
            >
              <option value="">
                {inspectorOptions.length ? "点検者を選択" : "点検者未登録"}
              </option>
              {inspectorOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          )}
          </div>
          </div>

        {/* 初回の状況（備考） */}
<div className="p-2 border-b border-slate-800 bg-slate-100/40 font-bold">
  <label className="text-[9px] text-black block mb-2">
    状況（備考）
  </label>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">

    {/* ① 仕上げ材 */}
    <div className="p-2 border border-slate-400 rounded bg-white">
      <label className="text-[9px] text-slate-700 block mb-1">
        仕上げ材
      </label>

      <select
        className="w-full mb-1 outline-none text-[12px] text-black bg-slate-50 border border-slate-200 rounded px-1 py-1"
        value=""
        onChange={e => addFinishText(e.target.value, firstFinish, setFirstFinish)}
      >
        <option value="">
          {inspectionPlace ? "仕上げ材を追加" : "点検場所を選択してください"}
        </option>
        {finishOptions.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>

      <textarea
        className="w-full h-12 outline-none text-[13px] resize-none leading-tight text-black placeholder-slate-400"
        placeholder="手入力で追加・編集"
        value={firstFinish}
        onChange={e => setFirstFinish(e.target.value)}
      />
    </div>

    {/* ② 状況 */}
    <div className="p-2 border border-slate-400 rounded bg-white">
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-[9px] text-slate-700">
          状況
        </label>
        <button
          type="button"
          className="px-2 py-0.5 rounded bg-slate-700 text-white text-[10px] font-bold"
          onClick={() => setShowCheckPanel(true)}
        >
          チェック
        </button>
      </div>

      <textarea
        className="w-full h-16 outline-none text-[13px] resize-none leading-tight text-black placeholder-slate-400"
        placeholder="状況入力"
        value={firstSituation}
        onChange={e => setFirstSituation(e.target.value)}
      />
    </div>

    {/* ③ サイズ・詳細 */}
    <div className="p-2 border border-slate-400 rounded bg-white">
      <label className="text-[9px] text-slate-700 block mb-1">
        サイズ、詳細
      </label>

      <textarea
        className="w-full h-16 outline-none text-[13px] resize-none leading-tight text-black placeholder-slate-400"
        placeholder="サイズ、詳細入力"
        value={firstDetail}
        onChange={e => setFirstDetail(e.target.value)}
        onBlur={e => setFirstDetail(formatSizeDetailValue(e.target.value))}
      />
    </div>

  </div>
</div>

{/* 初回点検写真 */}
<div className="flex-1 p-2 overflow-y-auto bg-slate-100/40">

  <div className="text-center text-[10px] font-black text-slate-700 mb-2">
    初回点検写真
  </div>

  {/* 上段：写真1・2 */}
  <div className="border border-black rounded p-2 mb-3 bg-white">
    <div className="grid grid-cols-2 gap-3">

      {firstPhotos.slice(0,2).map((p, i) => {
        const index = i;
        const marks = firstPhotoMarks[index] || [];

        return (
          <div key={index} className="relative aspect-[4/3]">
            <div className="w-full h-full bg-white rounded border border-slate-300 overflow-hidden">
              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-contain"
                  onMouseDown={() => handlePressStart(p)}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={handlePressEnd}
                  onTouchStart={() => handlePressStart(p)}
                  onTouchEnd={handlePressEnd}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-slate-400 font-bold">
                  初回写真{index + 1}
                </div>
              )}
            </div>
            {renderPhotoMarkOverlay(marks)}

            <input
              id={`karte-first-photo-${index}`}
              type="file"
              accept="image/*"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              ref={(el) => { firstFileInputs.current[index] = el }}
              onChange={(e) => handleFirstCapture(e, index)}
            />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openDrivePicker({ type: 'karteFirst', index }, INSPECTION_DRIVE_ROOT_FOLDER_ID);
              }}
              className="absolute bottom-1 left-1 z-20 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow"
            >
              Drive
            </button>

            {!!p && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPhotoMarkEditor('first', index);
                }}
                className="absolute bottom-1 right-1 z-20 rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white shadow"
              >
                編集
              </button>
            )}

            {!!p && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const n = [...firstPhotos];
                  n[index] = null;
                  setFirstPhotos(n);
                  setFirstPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const n = [...firstPhotos];
                  n[index] = null;
                  setFirstPhotos(n);
                  setFirstPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
                }}
                className="absolute top-1 right-1 z-30 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

    </div>
  </div>

  {/* 下段：写真3・4 */}
  <div className="border border-black rounded p-2 bg-white">
    <div className="grid grid-cols-2 gap-3">

      {firstPhotos.slice(2,4).map((p, i) => {
        const index = i + 2;
        const marks = firstPhotoMarks[index] || [];

        return (
          <div key={index} className="relative aspect-[4/3]">
            <div className="w-full h-full bg-white rounded border border-slate-300 overflow-hidden">
              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-contain"
                  onMouseDown={() => handlePressStart(p)}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={handlePressEnd}
                  onTouchStart={() => handlePressStart(p)}
                  onTouchEnd={handlePressEnd}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-slate-400 font-bold">
                  初回写真{index + 1}
                </div>
              )}
            </div>
            {renderPhotoMarkOverlay(marks)}

            <input
              id={`karte-first-photo-${index}`}
              type="file"
              accept="image/*"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              ref={(el) => { firstFileInputs.current[index] = el }}
              onChange={(e) => handleFirstCapture(e, index)}
            />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openDrivePicker({ type: 'karteFirst', index }, INSPECTION_DRIVE_ROOT_FOLDER_ID);
              }}
              className="absolute bottom-1 left-1 z-20 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow"
            >
              Drive
            </button>

            {!!p && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPhotoMarkEditor('first', index);
                }}
                className="absolute bottom-1 right-1 z-20 rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white shadow"
              >
                編集
              </button>
            )}

            {!!p && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const n = [...firstPhotos];
                  n[index] = null;
                  setFirstPhotos(n);
                  setFirstPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const n = [...firstPhotos];
                  n[index] = null;
                  setFirstPhotos(n);
                  setFirstPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
                }}
                className="absolute top-1 right-1 z-30 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

    </div>
  </div>

</div>
        </div>

          {/* 【右：今回の点検内容入力（青文字ベース）】 */}
          <div className="flex flex-col h-full bg-white">
            <div className="bg-blue-800 text-white text-[10px] font-bold p-1 text-center uppercase tracking-widest">
               今回の点検状況を入力
            </div>
            
            {/* 今回の基本情報入力 */}
            <div className="grid grid-cols-2 text-[11px] border-b border-slate-800 font-bold">
              <div className="border-r border-slate-300 p-1 flex flex-col">
                <span className="text-[9px] text-blue-700">最新点検日</span>
                <div className="min-h-5 whitespace-pre-wrap font-normal text-black">
                  {inspectDate}
                </div>
              </div>
<div className="p-1 flex flex-col bg-blue-50/30">
  <span className="text-[9px] text-blue-700">点検者</span>

  {hasCurrentPhoto ? (
    <select
      className="outline-none text-black bg-transparent text-[12px]"
      value={photoKarteSelectedInspector}
      onChange={e => {
        setPhotoKarteSelectedInspector(e.target.value);
        setInspector(e.target.value);
      }}
    >
      <option value="">
        {inspectorOptions.length ? "点検者を選択" : "点検者未登録"}
      </option>
      {inspectorOptions.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  ) : (
    <div className="min-h-5 font-normal text-black"></div>
  )}
</div>
            </div>

{/* 今回の状況（備考） */}
<div className="p-2 border-b border-slate-800 bg-blue-50/20 font-bold">
  <label className="text-[9px] text-blue-700 block mb-2">状況（備考）</label>

  {/* ★ここ修正 */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">

    {/* ① 仕上げ材 */}
    <div className="p-2 border border-slate-400 rounded bg-white">
      <label className="text-[9px] text-blue-700 block mb-1">仕上げ材</label>
      <select
        className="w-full mb-1 outline-none text-[12px] text-black bg-blue-50/40 border border-blue-100 rounded px-1 py-1"
        value=""
        onChange={e => addFinishText(e.target.value, remarks1, setRemarks1)}
      >
        <option value="">
          {inspectionPlace ? "仕上げ材を追加" : "点検場所を選択してください"}
        </option>
        {finishOptions.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <textarea 
        className="w-full h-12 outline-none text-[13px] resize-none leading-tight text-black placeholder-slate-400" 
        placeholder="手入力で追加・編集"
        value={remarks1} 
        onChange={e => setRemarks1(e.target.value)} 
      />
    </div>

    {/* ② 状況 */}
    <div className="p-2 border border-slate-400 rounded bg-white">
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-[9px] text-blue-700">状況</label>
        <button
          type="button"
          className="px-2 py-0.5 rounded bg-blue-700 text-white text-[10px] font-bold"
          onClick={() => setShowCheckPanel(true)}
        >
          チェック
        </button>
      </div>
      <textarea 
        className="w-full h-16 outline-none text-[13px] resize-none leading-tight text-black placeholder-slate-400" 
        placeholder="状況入力"
        value={remarks2} 
        onChange={e => setRemarks2(e.target.value)} 
      />
    </div>

    {/* ③ サイズ・詳細 */}
    <div className="p-2 border border-slate-400 rounded bg-white">
      <label className="text-[9px] text-blue-700 block mb-1">サイズ、詳細</label>
      <textarea 
        className="w-full h-16 outline-none text-[13px] resize-none leading-tight text-black placeholder-slate-400" 
        placeholder="サイズ、詳細入力"
        value={remarks3} 
        onChange={e => setRemarks3(e.target.value)} 
        onBlur={e => setRemarks3(formatSizeDetailValue(e.target.value))}
      />
    </div>

  </div>
</div>

{/* 今回の写真撮影エリア */}
<div className="flex-1 p-2 overflow-y-auto bg-blue-50/10">

  <div className="text-center text-[10px] font-black text-blue-700 mb-2">
    今回の点検写真
  </div>

  {/* 上段：写真1・2 */}
  <div className="border border-black rounded p-2 mb-3">
    <div className="grid grid-cols-2 gap-3">

      {photos.slice(0,2).map((p, i) => {
        const index = i;
        const marks = currentPhotoMarks[index] || [];

        return (
          <div key={index} className="relative aspect-[4/3]">

            <div className="w-full h-full bg-white rounded border border-blue-200 overflow-hidden">

              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-contain"
                  onMouseDown={() => handlePressStart(p)}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={handlePressEnd}
                  onTouchStart={() => handlePressStart(p)}
                  onTouchEnd={handlePressEnd}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-blue-300 font-bold">
                  写真{index + 1}
                </div>
              )}

            </div>
            {renderPhotoMarkOverlay(marks)}

            <input
              id={`karte-photo-${index}`}
              type="file"
              accept="image/*"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              ref={(el) => { fileInputs.current[index] = el }}
              onChange={(e) => handleCapture(e, index)}
            />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openDrivePicker({ type: 'karteCurrent', index }, INSPECTION_DRIVE_ROOT_FOLDER_ID);
              }}
              className="absolute bottom-1 left-1 z-20 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow"
            >
              Drive
            </button>

            {!!p && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPhotoMarkEditor('current', index);
                }}
                className="absolute bottom-1 right-1 z-20 rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white shadow"
              >
                編集
              </button>
            )}

 {!!p && (
  <button
    type="button"
    onPointerDown={(e) => {
      e.preventDefault();
      e.stopPropagation();
      const n = [...photos];
      n[index] = null;
      setPhotos(n);
      setCurrentPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
    }}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      const n = [...photos];
      n[index] = null;
      setPhotos(n);
      setCurrentPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
    }}
    className="absolute top-1 right-1 z-30 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white"
  >
    ✕
  </button>
)}

          </div>
        );
      })}

    </div>
  </div>

  {/* 下段：写真3・4 */}
  <div className="border border-black rounded p-2">
    <div className="grid grid-cols-2 gap-3">

      {photos.slice(2,4).map((p, i) => {
        const index = i + 2;
        const marks = currentPhotoMarks[index] || [];

        return (
          <div key={index} className="relative aspect-[4/3]">

            <div className="w-full h-full bg-white rounded border border-blue-200 overflow-hidden">

              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-contain"
                  onMouseDown={() => handlePressStart(p)}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={handlePressEnd}
                  onTouchStart={() => handlePressStart(p)}
                  onTouchEnd={handlePressEnd}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-blue-300 font-bold">
                  写真{index + 1}
                </div>
              )}

            </div>
            {renderPhotoMarkOverlay(marks)}

            <input
              id={`karte-photo-${index}`}
              type="file"
              accept="image/*"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              ref={(el) => { fileInputs.current[index] = el }}
              onChange={(e) => handleCapture(e, index)}
            />

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openDrivePicker({ type: 'karteCurrent', index }, INSPECTION_DRIVE_ROOT_FOLDER_ID);
              }}
              className="absolute bottom-1 left-1 z-20 rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow"
            >
              Drive
            </button>

            {!!p && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPhotoMarkEditor('current', index);
                }}
                className="absolute bottom-1 right-1 z-20 rounded bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white shadow"
              >
                編集
              </button>
            )}

 {!!p && (
  <button
    type="button"
    onPointerDown={(e) => {
      e.preventDefault();
      e.stopPropagation();
      const n = [...photos];
      n[index] = null;
      setPhotos(n);
      setCurrentPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
    }}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      const n = [...photos];
      n[index] = null;
      setPhotos(n);
      setCurrentPhotoMarks(prev => prev.map((marks, markIndex) => markIndex === index ? [] : marks));
    }}
    className="absolute top-1 right-1 z-30 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white"
  >
    ✕
  </button>
)}

          </div>
        );
      })}

    </div>
  </div>

</div>
          </div>
        </div>

        {showCheckPanel && (
          <div className="fixed left-3 right-3 bottom-[76px] z-[80] max-h-[38vh] overflow-hidden border-2 border-orange-800 bg-amber-50 shadow-2xl text-black">
            <div className="flex items-center justify-between gap-3 border-b border-orange-800 bg-orange-100 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-orange-800">
                  チェック項目
                </p>
                <p className="truncate text-[13px] font-black text-stone-950">
                  {inspectionPlace ? `点検項目_${inspectionPlace}` : "点検場所を選択してください"}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded bg-orange-700 px-3 py-1.5 text-[12px] font-bold text-white"
                onClick={() => setShowCheckPanel(false)}
              >
                チェックを閉じる
              </button>
            </div>

            <div className="max-h-[calc(38vh-54px)] overflow-auto">
              {!inspectionPlace ? (
                <div className="p-4 text-center text-[13px] font-bold text-orange-800">
                  先に「点検場所の詳細」の② 点検場所を選択してください。
                </div>
              ) : checkItems.length === 0 ? (
                <div className="p-4 text-center text-[13px] font-bold text-orange-800">
                  該当するチェック項目シートがありません。
                </div>
              ) : (
                <table className="w-full border-collapse text-[12px]">
                  <tbody>
                    {checkItems.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex === 0 ? "bg-orange-200 font-black" : "odd:bg-white even:bg-amber-100/70"}>
                        {row.map((cell, colIndex) => (
                          <td
                            key={colIndex}
                            className="min-w-[120px] border border-orange-200 px-2 py-1 align-top"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {photoEditorTarget && (() => {
          const editorPhoto = photoEditorTarget.target === 'first'
            ? firstPhotos[photoEditorTarget.index]
            : photos[photoEditorTarget.index];
          const editorMarks = getPhotoMarks(photoEditorTarget);
          const selectedMark = editingPhotoMark && editorMarks.find(mark => mark.id === editingPhotoMark.id);

          if (!editorPhoto) return null;

          const getPhotoEditorPoint = (event: React.PointerEvent<Element>) => {
            const rect = photoEditorImageRef.current?.getBoundingClientRect();
            if (!rect) return null;

            return {
              x: clampPhotoPercent(((event.clientX - rect.left) / rect.width) * 100),
              y: clampPhotoPercent(((event.clientY - rect.top) / rect.height) * 100),
            };
          };

          const beginPhotoMarkDrag = (
            event: React.PointerEvent<Element>,
            mark: PhotoMark,
            mode: 'move' | 'resize' | 'rotate' | 'line-start' | 'line-end',
            corner?: 'nw' | 'ne' | 'sw' | 'se'
          ) => {
            event.preventDefault();
            event.stopPropagation();
            const point = getPhotoEditorPoint(event);
            if (!point) return;

            event.currentTarget.setPointerCapture(event.pointerId);
            photoMarkDragRef.current = {
              id: mark.id,
              mode,
              corner,
              lastX: point.x,
              lastY: point.y,
            };
            setEditingPhotoMark(mark);
            setPhotoMarkTool(mark.type);
            setPhotoMarkColor(mark.color);
            if (mark.type === 'text') setPhotoMarkText(mark.text);
          };

          const getEllipseRotationFromPointer = (
            event: React.PointerEvent<Element>,
            mark: PhotoEllipseMark
          ) => {
            const rect = photoEditorImageRef.current?.getBoundingClientRect();
            if (!rect) return mark.rotation;

            const centerX = rect.left + (mark.x / 100) * rect.width;
            const centerY = rect.top + (mark.y / 100) * rect.height;
            const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;

            return normalizePhotoRotation(angle + 90);
          };

          const handlePhotoMarkDragMove = (event: React.PointerEvent<Element>, mark: PhotoMark) => {
            const drag = photoMarkDragRef.current;
            if (drag.id !== mark.id || !drag.mode) return;

            event.preventDefault();
            event.stopPropagation();
            const point = getPhotoEditorPoint(event);
            if (!point) return;

            if (drag.mode === 'move') {
              const dx = point.x - drag.lastX;
              const dy = point.y - drag.lastY;
              drag.lastX = point.x;
              drag.lastY = point.y;

              if (mark.type === 'ellipse') {
                updatePhotoMark({ ...mark, x: clampPhotoPercent(mark.x + dx), y: clampPhotoPercent(mark.y + dy) });
              } else if (mark.type === 'line') {
                updatePhotoMark({
                  ...mark,
                  x1: clampPhotoPercent(mark.x1 + dx),
                  y1: clampPhotoPercent(mark.y1 + dy),
                  x2: clampPhotoPercent(mark.x2 + dx),
                  y2: clampPhotoPercent(mark.y2 + dy),
                });
              } else {
                updatePhotoMark({ ...mark, x: clampPhotoPercent(mark.x + dx), y: clampPhotoPercent(mark.y + dy) });
              }
              return;
            }

            if (mark.type === 'ellipse' && drag.mode === 'rotate') {
              updatePhotoMark({ ...mark, rotation: getEllipseRotationFromPointer(event, mark) });
              return;
            }

            if (mark.type === 'ellipse' && drag.mode === 'resize' && drag.corner) {
              const left = mark.x - mark.width / 2;
              const right = mark.x + mark.width / 2;
              const top = mark.y - mark.height / 2;
              const bottom = mark.y + mark.height / 2;
              const nextLeft = drag.corner.includes('w') ? point.x : left;
              const nextRight = drag.corner.includes('e') ? point.x : right;
              const nextTop = drag.corner.includes('n') ? point.y : top;
              const nextBottom = drag.corner.includes('s') ? point.y : bottom;
              const width = Math.max(4, Math.abs(nextRight - nextLeft));
              const height = Math.max(4, Math.abs(nextBottom - nextTop));

              updatePhotoMark({
                ...mark,
                x: clampPhotoPercent((nextLeft + nextRight) / 2),
                y: clampPhotoPercent((nextTop + nextBottom) / 2),
                width: Math.min(100, width),
                height: Math.min(100, height),
              });
              return;
            }

            if (mark.type === 'line' && drag.mode === 'line-start') {
              updatePhotoMark({ ...mark, x1: point.x, y1: point.y });
              return;
            }

            if (mark.type === 'line' && drag.mode === 'line-end') {
              updatePhotoMark({ ...mark, x2: point.x, y2: point.y });
            }
          };

          const endPhotoMarkDrag = (event: React.PointerEvent<Element>) => {
            event.preventDefault();
            event.stopPropagation();
            photoMarkDragRef.current = { id: null, mode: null, lastX: 0, lastY: 0 };
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch (_) {
              // Pointer capture may already be released by the browser.
            }
          };

          const changeSelectedColor = (color: PhotoMarkColor) => {
            setPhotoMarkColor(color);
            if (selectedMark) updatePhotoMark({ ...selectedMark, color } as PhotoMark);
          };

          const handleEditorCanvasTap = (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget && event.target !== photoEditorImageRef.current) return;
            const point = getPhotoEditorPoint(event);
            if (!point) return;

            if (selectedMark) {
              setEditingPhotoMark(null);
              return;
            }

            addPhotoMarkAt(point.x, point.y);
          };

          const renderEditorMark = (mark: PhotoMark) => {
            const isSelected = selectedMark?.id === mark.id;
            const selectMark = (event: React.PointerEvent<Element>) => {
              beginPhotoMarkDrag(event, mark, 'move');
            };

            if (mark.type === 'ellipse') {
              const handles = [
                { key: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
                { key: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
                { key: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
                { key: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
              ] as const;

              return (
                <React.Fragment key={mark.id}>
                  <div
                    className="pointer-events-none absolute z-10 touch-none"
                    style={{
                      left: `${mark.x}%`,
                      top: `${mark.y}%`,
                      width: `${Math.max(2, mark.width)}%`,
                      height: `${Math.max(2, mark.height)}%`,
                      transform: `translate(-50%, -50%) rotate(${mark.rotation}deg)`,
                      transformOrigin: 'center',
                    }}
                  >
                    {isSelected && (
                      <div className="absolute inset-0 rounded-full border-[8px] border-white opacity-90" />
                    )}
                    <div
                      className="absolute inset-0 rounded-full border-4"
                      style={{ borderColor: mark.color }}
                    />
                    <div
                      className="pointer-events-auto absolute inset-[-10px] cursor-move rounded-full"
                      onPointerDown={selectMark}
                      onPointerMove={(event) => handlePhotoMarkDragMove(event, mark)}
                      onPointerUp={endPhotoMarkDrag}
                      onPointerCancel={endPhotoMarkDrag}
                    />
                    {isSelected && (
                      <>
                        <div className="absolute left-1/2 top-[-38px] h-[38px] w-px -translate-x-1/2 bg-white/80" />
                        <button
                          type="button"
                          aria-label="楕円を回転"
                          title="楕円を回転"
                          className="pointer-events-auto absolute left-1/2 top-[-52px] flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-lg font-black leading-none text-white shadow"
                          onPointerDown={(event) => beginPhotoMarkDrag(event, mark, 'rotate')}
                          onPointerMove={(event) => handlePhotoMarkDragMove(event, mark)}
                          onPointerUp={endPhotoMarkDrag}
                          onPointerCancel={endPhotoMarkDrag}
                        >
                          ↻
                        </button>
                        {handles.map(handle => (
                          <div
                            key={`${mark.id}-${handle.key}`}
                            className="pointer-events-auto absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none border-2 border-white bg-slate-900 shadow"
                            style={{
                              left: handle.left,
                              top: handle.top,
                              cursor: handle.cursor,
                            }}
                            onPointerDown={(event) => beginPhotoMarkDrag(event, mark, 'resize', handle.key)}
                            onPointerMove={(event) => handlePhotoMarkDragMove(event, mark)}
                            onPointerUp={endPhotoMarkDrag}
                            onPointerCancel={endPhotoMarkDrag}
                          />
                        ))}
                      </>
                    )}
                  </div>
                  {isSelected && (
                    <button
                      type="button"
                      className="pointer-events-auto absolute z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rose-600 text-sm font-black text-white shadow"
                      style={{ left: `${Math.min(98, mark.x + mark.width / 2 + 4)}%`, top: `${Math.max(2, mark.y - mark.height / 2 - 4)}%` }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deletePhotoMark(mark.id);
                      }}
                    >
                      x
                    </button>
                  )}
                </React.Fragment>
              );
            }

            if (mark.type === 'line') {
              return (
                <React.Fragment key={mark.id}>
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full touch-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <line
                      x1={mark.x1}
                      y1={mark.y1}
                      x2={mark.x2}
                      y2={mark.y2}
                      stroke="white"
                      strokeWidth={isSelected ? 8 : 0}
                      strokeLinecap="round"
                      opacity={isSelected ? 0.9 : 0}
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      className="pointer-events-auto cursor-move"
                      x1={mark.x1}
                      y1={mark.y1}
                      x2={mark.x2}
                      y2={mark.y2}
                      stroke={mark.color}
                      strokeWidth={4}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={selectMark}
                      onPointerMove={(event) => handlePhotoMarkDragMove(event, mark)}
                      onPointerUp={endPhotoMarkDrag}
                      onPointerCancel={endPhotoMarkDrag}
                    />
                    <line
                      className="pointer-events-auto cursor-move"
                      x1={mark.x1}
                      y1={mark.y1}
                      x2={mark.x2}
                      y2={mark.y2}
                      stroke="transparent"
                      strokeWidth={18}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={selectMark}
                      onPointerMove={(event) => handlePhotoMarkDragMove(event, mark)}
                      onPointerUp={endPhotoMarkDrag}
                      onPointerCancel={endPhotoMarkDrag}
                    />
                  </svg>
                  {isSelected && ([
                    { mode: 'line-start' as const, x: mark.x1, y: mark.y1 },
                    { mode: 'line-end' as const, x: mark.x2, y: mark.y2 },
                  ]).map(handle => (
                    <div
                      key={`${mark.id}-${handle.mode}`}
                      className="pointer-events-auto absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none border-2 border-white bg-slate-900 shadow"
                      style={{ left: `${handle.x}%`, top: `${handle.y}%`, cursor: 'grab' }}
                      onPointerDown={(event) => beginPhotoMarkDrag(event, mark, handle.mode)}
                      onPointerMove={(event) => handlePhotoMarkDragMove(event, mark)}
                      onPointerUp={endPhotoMarkDrag}
                      onPointerCancel={endPhotoMarkDrag}
                    />
                  ))}
                  {isSelected && (
                    <button
                      type="button"
                      className="pointer-events-auto absolute z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rose-600 text-sm font-black text-white shadow"
                      style={{ left: `${Math.min(98, Math.max(mark.x1, mark.x2) + 4)}%`, top: `${Math.max(2, Math.min(mark.y1, mark.y2) - 4)}%` }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deletePhotoMark(mark.id);
                      }}
                    >
                      x
                    </button>
                  )}
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={mark.id}>
                <div
                  className="pointer-events-auto absolute touch-none whitespace-pre rounded bg-white/60 px-1 text-[16px] font-black leading-tight"
                  style={{
                    left: `${mark.x}%`,
                    top: `${mark.y}%`,
                    color: mark.color,
                    fontFamily: '"MS Gothic", "ＭＳ ゴシック", sans-serif',
                    boxShadow: isSelected ? '0 0 0 2px rgba(255,255,255,0.9)' : undefined,
                    cursor: 'move',
                  }}
                  onPointerDown={selectMark}
                  onPointerMove={(event) => handlePhotoMarkDragMove(event, mark)}
                  onPointerUp={endPhotoMarkDrag}
                  onPointerCancel={endPhotoMarkDrag}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const text = window.prompt("文字を編集してください", mark.text);
                    if (text === null) return;
                    if (!text.trim()) deletePhotoMark(mark.id);
                    else updatePhotoMark({ ...mark, text: text.trim() });
                  }}
                >
                  {mark.text}
                </div>
                {isSelected && (
                  <button
                    type="button"
                    className="pointer-events-auto absolute z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rose-600 text-sm font-black text-white shadow"
                    style={{ left: `${Math.min(98, mark.x + 12)}%`, top: `${Math.max(2, mark.y - 5)}%` }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      deletePhotoMark(mark.id);
                    }}
                  >
                    x
                  </button>
                )}
              </React.Fragment>
            );
          };

          return (
            <div className="fixed inset-0 z-[900] flex flex-col overflow-hidden bg-slate-950 text-white">
              <div className="relative z-20 flex shrink-0 items-center gap-2 border-b border-white/15 bg-slate-900 p-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoEditorTarget(null);
                    setEditingPhotoMark(null);
                  }}
                  className="rounded bg-white/10 px-3 py-2 text-sm font-bold"
                >
                  閉じる
                </button>
                <div className="min-w-0 flex-1 text-center text-sm font-black">
                  {photoEditorTarget.target === 'first' ? '初回写真' : '今回写真'}{photoEditorTarget.index + 1}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoMarksForTarget(photoEditorTarget, () => []);
                    setEditingPhotoMark(null);
                  }}
                  className="rounded bg-rose-600 px-3 py-2 text-sm font-bold"
                >
                  全削除
                </button>
              </div>

              <div className="relative z-0 flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-2">
                <div
                  className="relative touch-none"
                  onPointerDown={handleEditorCanvasTap}
                >
                  <img
                    ref={photoEditorImageRef}
                    src={editorPhoto}
                    className="block max-h-[calc(100vh-284px)] max-w-[calc(100vw-16px)] select-none object-contain"
                    draggable={false}
                  />
                  <div className="pointer-events-none absolute inset-0">
                    {editorMarks.map(renderEditorMark)}
                  </div>
                </div>
              </div>

              <div className="relative z-30 h-[204px] shrink-0 space-y-2 overflow-y-auto border-t border-white/15 bg-slate-900 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'ellipse', label: '楕円○' },
                    { id: 'line', label: '線' },
                    { id: 'text', label: '文字' },
                  ] as const).map(tool => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => {
                        setPhotoMarkTool(tool.id);
                        setEditingPhotoMark(null);
                      }}
                      className={`rounded px-3 py-2 text-sm font-black ${photoMarkTool === tool.id && !selectedMark ? 'bg-white text-slate-900' : 'bg-white/10 text-white'}`}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-3">
                    {(['red', 'black', '#0070c0'] as const).map(color => (
                      <button
                        key={color}
                        type="button"
                        aria-label={color}
                        onClick={() => changeSelectedColor(color)}
                        className={`h-10 w-10 rounded-full border-4 ${photoMarkColor === color ? 'border-white' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  {selectedMark ? (
                    <button
                      type="button"
                      onClick={() => deletePhotoMark(selectedMark.id)}
                      className="rounded bg-rose-600 px-4 py-2 text-sm font-black"
                    >
                      選択を削除
                    </button>
                  ) : (
                    <div className="min-w-[96px]" />
                  )}
                </div>

                <div className="h-[62px] overflow-y-auto text-center text-xs font-bold text-white/70">
                  {selectedMark ? (
                    <>
                    {selectedMark.type === 'ellipse' && '中央をスライドで移動、四隅の■でサイズ変更、上の↻で回転できます。'}
                    {selectedMark.type === 'line' && '線をスライドで移動、両端の■をスライドで長さと向きを変更できます。'}
                    {selectedMark.type === 'text' && '文字をスライドで移動、文字変更は下のボタンか文字をダブルタップします。'}
                    {selectedMark.type === 'text' && (
                      <button
                        type="button"
                        onClick={() => {
                          const text = window.prompt("文字を編集してください", selectedMark.text);
                          if (text === null) return;
                          if (!text.trim()) {
                            deletePhotoMark(selectedMark.id);
                          } else {
                            updatePhotoMark({ ...selectedMark, text: text.trim() });
                          }
                        }}
                        className="mt-2 block w-full rounded bg-white/10 py-2 font-black"
                      >
                        文字を変更
                      </button>
                    )}
                    </>
                  ) : (
                    '写真をタップすると選択中のマークを追加できます。マークをタップすると編集できます。'
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {previewPhoto && (
        <div
    className="fixed inset-0 bg-black/80 flex items-center justify-center z-[999]"
    onClick={() => setPreviewPhoto(null)}
       >
      <img
      src={previewPhoto}
      className="max-w-[95%] max-h-[95%] object-contain rounded"
       />
      </div>
    )}

        {/* --- 保存ボタン --- */}
        <div className="sticky bottom-0 z-40 flex w-full flex-col items-center gap-3 border-t border-slate-600 bg-slate-800 p-3">
          {isPhoto && (
            <div className="w-full max-w-5xl rounded-xl bg-white/10 px-4 py-2 text-center text-sm font-black text-amber-100">
              スプレッドシート未保存 {unsavedPhotoKarteCount}件 / あと{remainingUnsavedPhotoKarteCount}件
            </div>
          )}
          <div className="flex w-full max-w-5xl flex-row gap-2">
            {isPhoto && (
              <button
                type="button"
                onClick={toggleCurrentPhotoKarteComplete}
                className={`min-h-[52px] flex-1 rounded-xl px-2 py-3 text-sm font-black shadow-xl transition-all active:scale-95 ${
                  isPhotoKarteComplete(karteNo)
                    ? "bg-emerald-500 text-white"
                    : "bg-amber-400 text-slate-950"
                }`}
              >
                {isPhotoKarteComplete(karteNo) ? "完了マーク解除" : "完了マーク"}
              </button>
            )}
            {isPhoto && (
              <button
                type="button"
                onClick={savePhotoKarteDraft}
                disabled={isSending}
                className="min-h-[52px] flex-1 rounded-xl border-2 border-emerald-600 bg-white px-2 py-3 text-sm font-black text-black shadow-xl transition-all active:scale-95 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {isSending ? "保存中..." : "この内容を一時保存"}
              </button>
            )}
            {isPhoto && (
              <button
                type="button"
                onClick={() => syncUnsavedPhotoKartes()}
                disabled={isSending || unsavedPhotoKarteCount === 0}
                className="min-h-[52px] flex-1 rounded-xl bg-emerald-600 px-2 py-3 text-sm font-black text-white shadow-xl transition-all active:scale-95 disabled:bg-slate-400"
              >
                {isSending ? "保存中..." : "未保存分をスプレッドシートへ保存"}
              </button>
            )}
            <button
              onClick={() => sendGenericKarte(isPhoto ? "uploadKarte" : "uploadInclination")}
              disabled={isSending}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-2 py-3 text-sm font-black text-white shadow-xl transition-all active:scale-95 disabled:bg-slate-400"
            >
              {isSending ? "データを送信中..." : "この内容でスプレッドシートを更新"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 次のモード（editorなど）がここから始まる ---

  const fetchMapStationNo = async () => {
    if (!selectedRoute || !stationName || !selectedYear) {
      return String(stationNo || '').trim();
    }

    const result = await gasApi("getInspectionListDates", {
      masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
      routeName: selectedRoute,
      station: stationName,
      year: selectedYear,
    });
    const nextStationNo = String(result.stationNo || '').trim();

    if (nextStationNo) {
      setStationNo(nextStationNo);
      return nextStationNo;
    }

    return String(stationNo || '').trim();
  };

  const normalizeMapColor = (value: unknown): MapColor => {
    const color = String(value || '').trim().toLowerCase();
    if (color === 'black') return 'black';
    if (color === '#0070c0' || color === '#5372fc') return '#0070c0';
    return 'red';
  };

  const clampPercent = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
  };

  const getNextMapMarkerLabel = (
    color: Marker['color'],
    shape: Marker['shape']
  ) => {
    if (color === '#0070c0' && shape === 'square') {
      const toFullWidthAlphaLabel = (value: number) => {
        let n = value;
        let label = "";

        while (n > 0) {
          n -= 1;
          label = String.fromCharCode(0xff21 + (n % 26)) + label;
          n = Math.floor(n / 26);
        }

        return label;
      };

      const usedLabels = new Set(
        markers
          .filter(marker => marker.color === '#0070c0' && marker.shape === 'square')
          .map(marker => String(marker.label || '').trim().toUpperCase())
          .filter(Boolean)
      );

      for (let index = 1; index <= 702; index += 1) {
        const label = toFullWidthAlphaLabel(index);
        if (!usedLabels.has(label)) return label;
      }

      return toFullWidthAlphaLabel(usedLabels.size + 1);
    }

    const isTargetMarker = (marker: Marker) => {
      if ((color === 'red' || color === 'black') && shape === 'circle') {
        return (
          marker.shape === 'circle' &&
          (marker.color === 'red' || marker.color === 'black')
        );
      }

      return true;
    };

    const maxNumber = markers
      .filter(isTargetMarker)
      .map(marker => Number.parseInt(String(marker.label || ''), 10))
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0);

    return String(maxNumber + 1);
  };

  const updateNewMarkerStyle = (
    nextColor: Marker['color'],
    nextShape: Marker['shape']
  ) => {
    setFormColor(nextColor);
    setFormShape(nextShape);

    if (!editingMarker) {
      setFormLabel(getNextMapMarkerLabel(nextColor, nextShape));
    }
  };

  const loadSavedMapEditorData = async (silent = false) => {
    if (!spreadsheetId) return;

    setIsLoading(true);
    try {
      const result = await gasApi("getMapEditorData", { spreadsheetId });
      const data = result.data || {};
      const restoredFinalImage = typeof data.finalImage === 'string' ? data.finalImage : '';
      const restoredMarkers = Array.isArray(data.markers) ? data.markers : [];
      const restoredTexts = Array.isArray(data.texts) ? data.texts : [];
      const restoredLines = Array.isArray(data.lines) ? data.lines : [];

      if (!restoredFinalImage) {
        if (!silent) alert("保存済みの位置図編集データはありません");
        return;
      }

      setSourceImage(null);
      setFinalImage(restoredFinalImage);
      setMarkers(
        restoredMarkers
          .map((marker: Partial<Marker>, index: number) => ({
            id: Number(marker.id) || Date.now() + index,
            x: clampPercent(marker.x),
            y: clampPercent(marker.y),
            label: String(marker.label || index + 1),
            color: normalizeMapColor(marker.color),
            shape: marker.shape === 'square' ? 'square' : 'circle',
          }))
          .filter((marker: Marker) => Number.isFinite(marker.x) && Number.isFinite(marker.y))
      );
      setMapTexts(
        restoredTexts
          .map((text: Partial<MapTextAnnotation>, index: number) => ({
            id: Number(text.id) || Date.now() + 10000 + index,
            x: clampPercent(text.x),
            y: clampPercent(text.y),
            text: String(text.text || ''),
            color: normalizeMapColor(text.color),
          }))
          .filter((text: MapTextAnnotation) => text.text.trim())
      );
      setMapLines(
        restoredLines
          .map((line: Partial<MapLineAnnotation>, index: number) => ({
            id: Number(line.id) || Date.now() + 20000 + index,
            x1: clampPercent(line.x1),
            y1: clampPercent(line.y1),
            x2: clampPercent(line.x2),
            y2: clampPercent(line.y2),
            color: normalizeMapColor(line.color),
          }))
      );

      if (!silent) alert("保存済みの位置図を読み込みました");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!silent || !/Unknown action|action=getMapEditorData/i.test(message)) {
        alert(`保存済み位置図の読み込みに失敗しました: ${message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMap = async () => {
    if (!finalImage || isSending) return;
    if (!spreadsheetId) {
      alert("スプレッドシートIDがありません。駅と年度を選び直してください。");
      return;
    }
    setIsSending(true);
    try {
      const canvas = document.createElement('canvas');
      const img = imageRef.current;
      if (!img) throw new Error("位置図画像を読み込めていません");
      const mapStationNo = await fetchMapStationNo();
      if (!mapStationNo) {
        throw new Error("点検リスト_マスタから駅No.を取得できませんでした");
      }

      const outputSize = getScaledImageSize(img.naturalWidth, img.naturalHeight, 900000);
      canvas.width = outputSize.width;
      canvas.height = outputSize.height;
      const ctx = canvas.getContext('2d');
      if (!canvas.width || !canvas.height) {
        throw new Error("位置図画像のサイズを取得できません");
      }
      if (!ctx) throw new Error("画像処理を開始できません");

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      mapLines.forEach(line => {
        ctx.beginPath();
        ctx.lineWidth = Math.max(1, 1.4 * outputSize.scale);
        ctx.strokeStyle = line.color;
        ctx.moveTo((line.x1 / 100) * canvas.width, (line.y1 / 100) * canvas.height);
        ctx.lineTo((line.x2 / 100) * canvas.width, (line.y2 / 100) * canvas.height);
        ctx.stroke();
      });

      mapTexts.forEach(item => {
        const x = (item.x / 100) * canvas.width;
        const y = (item.y / 100) * canvas.height;
        const fontSize = Math.max(12, Math.round(16 * outputSize.scale));

        ctx.fillStyle = item.color;
        ctx.font = `${fontSize}px "MS Gothic", "ＭＳ ゴシック", monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const lines = item.text.split(/\r?\n/);
        const lineHeight = fontSize * 1.25;
        const textBlockHeight = fontSize + Math.max(0, lines.length - 1) * lineHeight;
        const startY = y - textBlockHeight / 2;

        lines.forEach((line, index) => {
          ctx.fillText(line, x, startY + index * lineHeight);
        });
      });

      markers.forEach(m => {
        const x = (m.x / 100) * canvas.width;
        const y = (m.y / 100) * canvas.height;
        const baseSize = Math.max(28, Math.round(34 * outputSize.scale));
        const size = m.color === '#0070c0' && m.shape === 'square'
          ? Math.max(22, Math.round(baseSize * 0.82))
          : m.shape === 'circle' && (m.color === 'red' || m.color === 'black')
            ? Math.max(24, Math.round(baseSize * 0.9))
          : baseSize;
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = m.color;
        ctx.fillStyle = "white";
        if (m.shape === 'circle') { ctx.arc(x, y, size/2, 0, Math.PI * 2); } 
        else { ctx.rect(x - size/2, y - size/2, size, size); }
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = m.color;
        ctx.font = `bold ${size * 0.6}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(m.label, x, y);
      });

      const outputDataUrl = getCanvasDataUrlUnderLimit(canvas, 1800000);
      const combinedBase64 = outputDataUrl.split(',')[1];
      const payload = {
        spreadsheetId,
        imageData: combinedBase64,
        imageMimeType: 'image/jpeg',
        imageFileName: 'marked_map.jpg',
        stationNo: mapStationNo,
        masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
        routeName: selectedRoute,
        station: stationName,
        year: selectedYear,
        editorData: {
          finalImage,
          markers,
          texts: mapTexts,
          lines: mapLines,
          routeName: selectedRoute,
          station: stationName,
          year: selectedYear,
          stationNo: mapStationNo,
          updatedAt: new Date().toISOString(),
        }
      };

      await gasApi("uploadPhotos", payload);
      alert("位置図を保存しました。");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("位置図保存エラー", e);
      alert(`保存に失敗しました: ${message}`);
    } finally {
      setIsSending(false);
    }
  };

// --- 2. エディタ画面のUI部分 ---
if (mode === 'editor') {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-black" style={routePageStyle}>
      {/* ★ ここに追加：画面全体のローディングオーバーレイ */}
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
            <svg className="animate-spin h-12 w-12 text-indigo-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-slate-800 font-bold text-lg">Googleドライブを参照中...</p>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col items-center p-2 sm:p-3">
        <Nav />

        {/* 上部操作パネル */}
  <div className="my-2 flex w-full shrink-0 gap-2 rounded-lg bg-white p-2 shadow-sm">
    {!sourceImage && !finalImage ? (
      <>
        <button onClick={() => loadSavedMapEditorData(false)} className="transition-all active:scale-95 active:brightness-90 flex-1 rounded-md bg-indigo-600 px-2 py-2 text-sm font-bold text-white">
        保存済み
        </button>
        <button onClick={() => window.open(`https://www.google.com/search?q=${stationName}+構内図&tbm=isch`, '_blank')} className="flex-1 rounded-md bg-slate-800 px-2 py-2 text-sm font-bold text-white">Web検索</button>
        <button onClick={() => openDrivePicker({ type: 'map' })} className="transition-all active:scale-95 active:brightness-90 flex-1 rounded-md bg-emerald-600 px-2 py-2 text-sm font-bold text-white">
        ドライブ
        </button>
      </>
    ) : sourceImage && !finalImage ? (
      <button onClick={async () => {
              const img = new Image(); img.src = sourceImage!;
              await new Promise((resolve) => { img.onload = resolve; });
              const canvas = document.createElement('canvas');
              const cp = croppedAreaPixels;
              const cropOutputSize = getScaledImageSize(cp.width, cp.height, 900000);
              canvas.width = cropOutputSize.width; canvas.height = cropOutputSize.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, cp.x, cp.y, cp.width, cp.height, 0, 0, canvas.width, canvas.height);
                const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
                // モノクロ化 (白黒) 処理
                for (let i = 0; i < idata.data.length; i += 4) {
                  const g = idata.data[i] * 0.3 + idata.data[i + 1] * 0.59 + idata.data[i + 2] * 0.11;
                  idata.data[i] = idata.data[i + 1] = idata.data[i + 2] = g;
                }
                ctx.putImageData(idata, 0, 0);
                setFinalImage(getCanvasDataUrlUnderLimit(canvas, 1800000));
              }
            }} className="transition-all active:scale-95 active:brightness-90 w-full rounded-md bg-amber-500 px-3 py-2 text-sm font-bold text-white shadow">この範囲で確定（モノクロ化）</button>
          ) : (
            <>
              <button onClick={() => { setFinalImage(null); setSourceImage(null); setMarkers([]); setMapTexts([]); setMapLines([]); setSelectedLineId(null); }} className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">画像変更</button>
        {/* 送信ボタン（アニメーション付き） */}
        <button 
          onClick={handleSaveMap} 
          disabled={isSending} 
          className={`transition-all active:scale-95 active:brightness-90 flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold shadow transition-all ${
            isSending ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 text-white active:scale-95"
          }`}
        >
          {isSending ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              送信中...
            </>
          ) : (
            "スプレッドシートへ送信"
          )}
        </button>
      </>
    )}
  </div>
        {/* メイン編集エリア */}
        <div ref={mapStageRef} className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-lg border border-white bg-slate-200" 
          style={{ touchAction: 'none' }}
        >
          {sourceImage && !finalImage && (
            <>
              <Cropper
                image={sourceImage}
                crop={crop}
                zoom={zoom}
                aspect={mapImageAspect}
                minZoom={1}
                maxZoom={3}
                objectFit="contain"
                onCropChange={setCrop}
                onCropComplete={(_, p) => setCroppedAreaPixels(p)}
                onZoomChange={setZoom}
                onMediaLoaded={({ naturalWidth, naturalHeight }) => {
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setMapImageAspect(naturalWidth / naturalHeight);
                  }
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                }}
                style={{ containerStyle: { background: '#e2e8f0' } }}
              />
              <div className="absolute bottom-3 left-1/2 z-10 flex w-[min(92%,420px)] -translate-x-1/2 items-center gap-2 rounded-xl bg-white/95 p-2 shadow-lg">
                <button
                  type="button"
                  aria-label="縮小"
                  onClick={() => setZoom(current => Math.max(1, Number((current - 0.1).toFixed(2))))}
                  disabled={zoom <= 1}
                  className="h-10 w-10 shrink-0 rounded-lg bg-slate-200 text-xl font-black text-slate-700 disabled:opacity-40"
                >
                  －
                </button>
                <input
                  type="range"
                  aria-label="画像の拡大率"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="min-w-0 flex-1 accent-indigo-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                  }}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
                >
                  全体表示
                </button>
                <button
                  type="button"
                  aria-label="拡大"
                  onClick={() => setZoom(current => Math.min(3, Number((current + 0.1).toFixed(2))))}
                  disabled={zoom >= 3}
                  className="h-10 w-10 shrink-0 rounded-lg bg-slate-200 text-xl font-black text-slate-700 disabled:opacity-40"
                >
                  ＋
                </button>
              </div>
            </>
          )}

          {finalImage && (
            <div className="relative max-h-full max-w-full shrink-0" 
              style={{
                width: mapDisplaySize.width ? `${mapDisplaySize.width}px` : 'auto',
                height: mapDisplaySize.height ? `${mapDisplaySize.height}px` : 'auto',
                touchAction: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              }}
              onContextMenu={(e) => e.preventDefault()} // 右クリック/ロングタップメニュー禁止
            >
              {/* 下地画像（ガード済み） */}
              <img 
                ref={imageRef} 
                src={finalImage} 
                className={`block rounded-md object-contain pointer-events-none select-none ${
                  mapDisplaySize.width && mapDisplaySize.height ? 'h-full w-full' : 'max-h-full max-w-full'
                }`}
                draggable="false" 
                onLoad={updateMapDisplaySize}
              />
              
              {/* 透明クリックレイヤー（ガード兼マーク配置用） */}
              <div 
                className="absolute inset-0 z-20 cursor-crosshair"
                onClick={(e) => {
                  if (
                    draggingMarkerId !== null ||
                    draggingTextId !== null ||
                    draggingLineHandle !== null ||
                    (e.target as HTMLElement).closest('.marker, .map-text, .map-line, .line-handle')
                  ) return;
                  if (selectedLineId !== null) {
                    setSelectedLineId(null);
                    return;
                  }
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTempPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                  setEditingMarker(null);
                  setEditingText(null);
                  setEditingLine(null);
                  setSelectedLineId(null);
                  setFormMode('marker');
                  setFormColor('black');
                  setFormShape('circle');
                  setFormLabel(getNextMapMarkerLabel('black', 'circle'));
                  setFormText('');
                  setShowModal(true);
                }}
              >
                <svg className="absolute inset-0 z-20 h-full w-full pointer-events-none">
                  {mapLines.map(line => (
                    <React.Fragment key={line.id}>
                      <line
                        x1={`${line.x1}%`}
                        y1={`${line.y1}%`}
                        x2={`${line.x2}%`}
                        y2={`${line.y2}%`}
                        stroke="transparent"
                        strokeWidth="16"
                        className="map-line pointer-events-auto cursor-pointer touch-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedLineId === line.id) {
                            setEditingMarker(null);
                            setEditingText(null);
                            setEditingLine(line);
                            setFormMode('line');
                            setFormColor(line.color);
                            setShowModal(true);
                            return;
                          }
                          setSelectedLineId(line.id);
                        }}
                      />
                      <line
                        x1={`${line.x1}%`}
                        y1={`${line.y1}%`}
                        x2={`${line.x2}%`}
                        y2={`${line.y2}%`}
                        stroke={line.color}
                        strokeWidth="1.5"
                        pointerEvents="none"
                      />
                    </React.Fragment>
                  ))}
                </svg>
                {mapLines
                  .filter(line => selectedLineId === line.id || draggingLineHandle?.id === line.id)
                  .map(line => (
                  <React.Fragment key={`handles-${line.id}`}>
                    {(['start', 'end'] as const).map(endpoint => {
                      const x = endpoint === 'start' ? line.x1 : line.x2;
                      const y = endpoint === 'start' ? line.y1 : line.y2;

                      return (
                        <div
                          key={`${line.id}-${endpoint}`}
                          className="line-handle absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-700 shadow pointer-events-auto touch-none"
                          style={{ left: `${x}%`, top: `${y}%`, backgroundColor: line.color }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.currentTarget.setPointerCapture(e.pointerId);
                            setSelectedLineId(line.id);
                            setDraggingLineHandle({ id: line.id, endpoint });
                          }}
                          onPointerMove={(e) => {
                            if (!draggingLineHandle || draggingLineHandle.id !== line.id || draggingLineHandle.endpoint !== endpoint) return;
                            const r = imageRef.current?.getBoundingClientRect();
                            if (!r) return;
                            const nextX = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
                            const nextY = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));

                            setMapLines(lines => lines.map(item =>
                              item.id === line.id
                                ? endpoint === 'start'
                                  ? { ...item, x1: nextX, y1: nextY }
                                  : { ...item, x2: nextX, y2: nextY }
                                : item
                            ));
                          }}
                          onPointerUp={(e) => {
                            setDraggingLineHandle(null);
                            setSelectedLineId(line.id);
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          }}
                          onPointerCancel={() => {
                            setDraggingLineHandle(null);
                            setSelectedLineId(line.id);
                          }}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
                {mapTexts.map(item => (
                  <div
                    key={item.id}
                    className="map-text absolute z-30 -translate-y-1/2 cursor-move whitespace-pre rounded-sm bg-white/70 px-0.5 font-mono text-[10px] leading-none pointer-events-auto touch-none"
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      color: item.color,
                      fontFamily: '"MS Gothic", "ＭＳ ゴシック", monospace',
                      zIndex: draggingTextId === item.id ? 100 : 30,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      textDragRef.current = { id: item.id, lastX: e.clientX, lastY: e.clientY, isMoved: false };
                      setDraggingTextId(item.id);
                    }}
                    onPointerMove={(e) => {
                      if (textDragRef.current.id !== item.id) return;
                      const r = imageRef.current?.getBoundingClientRect();
                      if (!r) return;
                      const dx = ((e.clientX - textDragRef.current.lastX) / r.width) * 100;
                      const dy = ((e.clientY - textDragRef.current.lastY) / r.height) * 100;

                      if (Math.abs(e.clientX - textDragRef.current.lastX) > 1 || Math.abs(e.clientY - textDragRef.current.lastY) > 1) {
                        textDragRef.current.isMoved = true;
                      }

                      textDragRef.current.lastX = e.clientX;
                      textDragRef.current.lastY = e.clientY;

                      setMapTexts(texts => texts.map(text => text.id === item.id
                        ? {
                          ...text,
                          x: Math.max(0, Math.min(100, text.x + dx)),
                          y: Math.max(0, Math.min(100, text.y + dy)),
                        }
                        : text
                      ));
                    }}
                    onPointerUp={(e) => {
                      const wasMoved = textDragRef.current.isMoved;
                      textDragRef.current = { id: null, lastX: 0, lastY: 0, isMoved: false };
                      setDraggingTextId(null);
                      e.currentTarget.releasePointerCapture(e.pointerId);

                      if (!wasMoved) {
                        setEditingMarker(null);
                        setEditingLine(null);
                        setEditingText(item);
                        setFormMode('text');
                        setFormColor(item.color);
                        setFormText(item.text);
                        setShowModal(true);
                      }
                    }}
                    onPointerCancel={() => {
                      textDragRef.current = { id: null, lastX: 0, lastY: 0, isMoved: false };
                      setDraggingTextId(null);
                    }}
                  >
                    {item.text}
                  </div>
                ))}
                {markers.map(m => (
  <div key={m.id} 
    className="marker absolute flex items-center justify-center font-bold bg-white shadow-lg pointer-events-auto touch-none select-none"
    style={{ 
      left: `${m.x}%`, 
      top: `${m.y}%`, 
      transform: 'translate(-50%,-50%)', 
      width: '24px', 
      height: '24px', 
      border: `2px solid ${m.color}`, 
      color: m.color, 
      borderRadius: m.shape === 'circle' ? '50%' : '6px',
      zIndex: draggingMarkerId === m.id ? 100 : 30,
    }}
    // --- ポインターイベント (PC/Mobile共通) ---
    onPointerDown={(e) => {
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId); // ポインターを固定（枠外に出ても追従）

      dragRef.current.isMoved = false;
      dragRef.current.startX = e.clientX;
      dragRef.current.startY = e.clientY;

      // 0.2秒以上押し続けたら「ドラッグモード」開始
      dragRef.current.timer = setTimeout(() => {
        setDraggingMarkerId(m.id);
      }, 200);
    }}
    onPointerMove={(e) => {
      if (draggingMarkerId !== m.id) return;
      
      // 移動距離をチェック（誤操作防止）
      if (Math.abs(e.clientX - dragRef.current.startX) > 3 || 
          Math.abs(e.clientY - dragRef.current.startY) > 3) {
        dragRef.current.isMoved = true;
      }

      const r = imageRef.current?.getBoundingClientRect();
      if (r) {
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        
        setMarkers(prev => prev.map(mm => 
          mm.id === m.id ? { 
            ...mm, 
            x: Math.max(0, Math.min(100, x)), 
            y: Math.max(0, Math.min(100, y)) 
          } : mm
        ));
      }
    }}
    onPointerUp={(e) => {
      if (dragRef.current.timer) clearTimeout(dragRef.current.timer);
      
      // ドラッグ中ではなく、かつ移動もしていなければ編集モーダルを開く
      if (draggingMarkerId === null && !dragRef.current.isMoved) {
        setEditingMarker(m);
        setEditingText(null);
        setEditingLine(null);
        setSelectedLineId(null);
        setFormMode('marker');
        setFormLabel(m.label);
        setFormColor(m.color);
        setFormShape(m.shape);
        setShowModal(true);
      }
        setDraggingMarkerId(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }}
  >{m.label}</div>
))}
              </div>
            </div>
          )}
        </div>
      </div>
        {/* モーダル等のコード... */}
        {/* 位置図要素編集モーダル */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl scale-in-center">
              <h3 className="text-xl font-bold mb-6 text-slate-800">
                {editingMarker ? 'マーカーを編集' : editingText ? '文字を編集' : editingLine ? '線を編集' : '追加'}
              </h3>
              
              <div className="space-y-6">
                {!editingMarker && !editingText && !editingLine && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">種類</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'marker', label: 'マーカー' },
                        { id: 'text', label: '文字' },
                        { id: 'line', label: '線' },
                      ] as const).map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setFormMode(item.id);
                            if (item.id === 'marker') {
                              setFormColor('black');
                              setFormShape('circle');
                              setFormLabel(getNextMapMarkerLabel('black', 'circle'));
                            } else {
                              setFormColor('black');
                            }
                          }}
                          className={`rounded-xl border-2 px-2 py-3 text-sm font-black active:scale-95 ${
                            formMode === item.id
                              ? 'border-slate-800 bg-slate-800 text-white'
                              : 'border-slate-100 bg-white text-slate-500'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {formMode === 'marker' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">ラベル (No.)</label>
                    <input className="w-full p-4 bg-slate-100 rounded-2xl border-2 focus:border-indigo-500 outline-none text-lg font-bold" value={formLabel} onChange={e => setFormLabel(e.target.value)} />
                  </div>
                )}

                {formMode === 'text' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">文字</label>
                    <textarea
                      className="w-full min-h-24 resize-y rounded-2xl border-2 bg-slate-100 p-4 font-mono text-lg font-bold outline-none focus:border-indigo-500"
                      style={{ fontFamily: '"MS Gothic", "ＭＳ ゴシック", monospace' }}
                      value={formText}
                      onChange={e => setFormText(e.target.value)}
                      placeholder="文字を入力"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">カラー</label>
                  <div className="flex gap-4">
                    {(['red', 'black', '#0070c0'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => formMode === 'marker' ? updateNewMarkerStyle(c, formShape) : setFormColor(c)}
                        className={`transition-all active:scale-95 active:brightness-90 w-12 h-12 rounded-full border-4 transition-transform ${formColor === c ? 'scale-110 border-slate-300' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {formMode === 'marker' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">形状</label>
                  <div className="flex gap-4">
                    {([{id:'circle', n:'○'}, {id:'square', n:'□'}] as const).map(s => (
                      <button 
        key={s.id} 
        onClick={() => updateNewMarkerStyle(formColor, s.id)} 
        className={`transition-all active:scale-95 active:brightness-90 flex-1 py-3 rounded-xl border-2 font-bold transition-all ${
          formShape === s.id 
            ? 'bg-slate-800 text-white border-slate-800' 
            : 'bg-white text-slate-400 border-slate-100'
        } text-3xl`} // ← ここに text-2xl や text-3xl を追加すると「○」「□」が大きくなります
      >
        {s.n}
      </button>
                    ))}
                  </div>
                </div>
                )}
              </div>

              <div className="flex gap-3 mt-10">
                {(editingMarker || editingText || editingLine) && (
                  <button
                    onClick={() => {
                      if (editingMarker) setMarkers(prev => prev.filter(m => m.id !== editingMarker.id));
                      if (editingText) setMapTexts(prev => prev.filter(item => item.id !== editingText.id));
                      if (editingLine) setMapLines(prev => prev.filter(item => item.id !== editingLine.id));
                      setSelectedLineId(null);
                      setShowModal(false);
                    }}
                    className="transition-all active:scale-95 active:brightness-90 flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-bold active:bg-rose-100"
                  >
                    削除
                  </button>
                )}
                <button onClick={() => {
                  if (formMode === 'marker' && editingMarker) {
                    setMarkers(prev => prev.map(m => m.id === editingMarker.id ? { ...m, label: formLabel, color: formColor, shape: formShape } : m));
                  } else if (formMode === 'marker') {
                    setMarkers(prev => [...prev, { id: Date.now(), x: tempPos.x, y: tempPos.y, label: formLabel, color: formColor, shape: formShape }]);
                  } else if (formMode === 'text' && editingText) {
                    setMapTexts(prev => prev.map(item => item.id === editingText.id ? { ...item, text: formText, color: formColor } : item).filter(item => item.text.trim()));
                  } else if (formMode === 'text') {
                    const text = formText.trim();
                    if (text) setMapTexts(prev => [...prev, { id: Date.now(), x: tempPos.x, y: tempPos.y, text, color: formColor }]);
                  } else if (formMode === 'line' && editingLine) {
                    setMapLines(prev => prev.map(item => item.id === editingLine.id ? { ...item, color: formColor } : item));
                  } else if (formMode === 'line') {
                    setMapLines(prev => [...prev, {
                      id: Date.now(),
                      x1: tempPos.x,
                      y1: tempPos.y,
                      x2: Math.min(100, tempPos.x + 14),
                      y2: tempPos.y,
                      color: formColor,
                    }]);
                  }
                  setSelectedLineId(null);
                  setShowModal(false);
                }} className="transition-all active:scale-95 active:brightness-90 flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-transform">決定</button>
                <button onClick={() => { setSelectedLineId(null); setShowModal(false); }} className="transition-all active:scale-95 active:brightness-90 absolute top-4 right-4 text-slate-300 hover:text-slate-500 text-2xl">✕</button>
              </div>
            </div>
          </div>
        )}

        {/* ドライブ画像選択モーダル */}
        {showMapPicker && (
          <div className="fixed inset-0 z-[300] flex flex-col bg-white animate-slide-up">
            <div className="shrink-0 border-b border-slate-200 bg-white p-4 sm:p-6">
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <h3 className="text-xl font-bold">ドライブから位置図を選択</h3>
                <p className="mt-1 truncate text-sm font-bold text-slate-500">
                  {driveFolderPath || driveCurrentFolder?.name || "初期フォルダ"}
                </p>
              </div>
              <button onClick={() => setShowMapPicker(false)} className="transition-all active:scale-95 active:brightness-90 text-2xl">✕</button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {driveParentFolder && (
                <button
                  type="button"
                  onClick={() => loadDriveMapFolder(driveParentFolder.id)}
                  className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 active:scale-95"
                >
                  ↑ 上のフォルダ
                </button>
              )}
              <button
                type="button"
                onClick={() => loadDriveMapFolder(undefined, "", false)}
                className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 active:scale-95"
              >
                初期フォルダ
              </button>
            </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-10 sm:p-6">
              <div className="mb-6">
                <div className="mb-2 text-xs font-black uppercase text-slate-400">フォルダ</div>
                {driveFolders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">
                    このフォルダに下位フォルダはありません。
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {driveFolders.map(folder => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => loadDriveMapFolder(folder.id)}
                        className="transition-all active:scale-95 active:brightness-90 flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-bold text-slate-700"
                      >
                        <span className="text-xl">📁</span>
                        <span className="min-w-0 truncate text-sm">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-2 text-xs font-black uppercase text-slate-400">画像</div>
              {driveMaps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                  このフォルダに画像はありません。
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
              {driveMaps.map(m => (
                <button key={m.id} onClick={async () => {
                  setIsLoading(true);
                  try {
                    const result = await gasApi("getMapBase64", { id: m.id });
                    const base64 = String(result.base64 || "").trim();

                    if (!base64) {
                      throw new Error("Base64取得失敗");
                    }

                    setSourceImage(buildImageDataUrl(base64, result.mimeType));
                    setShowMapPicker(false);

                  } catch (e) { alert("読込失敗"); } finally { setIsLoading(false); }
                }} className="transition-all active:scale-95 active:brightness-90 flex flex-col gap-2 p-2 bg-slate-50 rounded-xl active:bg-slate-200">
                  <img src={m.thumbUrl} className="w-full aspect-video object-cover rounded-lg shadow-sm" alt="" />
                  <span className="text-[10px] font-bold text-slate-600 truncate w-full text-left">{m.name}</span>
                </button>
              ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 最後に何も該当しない場合のフォールバック
  return null;
  } //
