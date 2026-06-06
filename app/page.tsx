"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { gasApi } from "./lib/gasApi";
import Cropper from 'react-easy-crop';
import TaskSelect from "./components/TaskSelect";

interface Marker {
  id: number; x: number; y: number; label: string;
  color: 'red' | 'black' | '#5372fc'; shape: 'circle' | 'square';
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
  group: 'cover' | 'photo' | 'slope' | 'inclination' | 'inspectionReport';
}

interface PdfSheetGroups {
  cover: PdfSheetOption[];
  photo: PdfSheetOption[];
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

const INSPECTION_LIST_MASTER_ID = "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";

const createEmptySlopeRows = (count = 16): SlopeTableRow[] =>
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

const normalizeInspectionReportRow = (row: Partial<InspectionReportRow>, index: number): InspectionReportRow => ({
  id: Number(row.id) || index + 1,
  buildingName: toDisplayText(row.buildingName),
  inspectionPlace: toDisplayText(row.inspectionPlace),
  photoNo: toDisplayText(row.photoNo),
  finishType: toDisplayText(row.finishType),
  firstSituation: toDisplayText(row.firstSituation),
  firstEval: toDisplayText(row.firstEval),
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
  const [firstInspector, setFirstInspector] = useState(''); // 初回点検者 (F6)
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
  const [availableKarteNumbers, setAvailableKarteNumbers] = useState<string[]>([]);
  const [unavailableKarteNumbers, setUnavailableKarteNumbers] = useState<string[]>([]);
  const [registerKarteNo, setRegisterKarteNo] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  
  // --- 位置図エディタ用ステート ---
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [driveMaps, setDriveMaps] = useState<{ id: string, name: string, thumbUrl: string }[]>([]);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [draggingMarkerId, setDraggingMarkerId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingMarker, setEditingMarker] = useState<Marker | null>(null);
  const [tempPos, setTempPos] = useState({ x: 0, y: 0 });
  const [formLabel, setFormLabel] = useState('1');
  const [formColor, setFormColor] = useState<'red' | 'black' | '#5372fc'>('red');
  const [formShape, setFormShape] = useState<'circle' | 'square'>('circle');
  const imageRef = useRef<HTMLImageElement>(null);

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
  const [pdfSheets, setPdfSheets] = useState<PdfSheetGroups>({ cover: [], photo: [], slope: [], inclination: [], inspectionReport: [] });
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

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyLyGHlZ-v5lXMEibJKr50x_M7Al-3TRmmvp1Wnotxz4NCpu0EIzXJoyZvZnRW8c-IUXA/exec";



const getInspectionReportEvalClass = (
  field: keyof Omit<InspectionReportRow, 'id'>,
  value: string
) => {
  const text = String(value || '').trim();

  if (field === 'structEval') {
    return ['AA', 'A1', 'A2'].includes(text) ? 'text-red-600 font-black' : 'text-black';
  }

  if (field === 'firstEval' || field === 'totalEval') {
    return ['AA', 'A1', 'A2', 'B'].includes(text) ? 'text-red-600 font-black' : 'text-black';
  }

  return 'text-black';
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

const loadInspectionListDates = useCallback(async () => {
  if (!selectedRoute || !stationName || !selectedYear) return;

  try {
    const result = await gasApi("getInspectionListDates", {
      masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
      routeName: selectedRoute,
      station: stationName,
      year: selectedYear,
    });

    setFirstDate(formatSheetDateText(result.firstDate));
    setInspectDate(formatSheetDateText(result.latestDate));
    if (result.stationNo !== undefined && result.stationNo !== null && String(result.stationNo).trim()) {
      setStationNo(String(result.stationNo));
    }
  } catch (e) {
    console.warn("点検リスト_マスタの日付取得に失敗しました", e);
  }
}, [selectedRoute, stationName, selectedYear]);

const loadCoverInspectionDate = useCallback(async () => {
  if (!selectedRoute || !stationName || !selectedYear) {
    setCoverDateStatus("路線・駅名・年度を選択してください");
    return;
  }

  setCoverDateStatus("調査日を読み込み中...");

  try {
    const result = await gasApi("getInspectionListDates", {
      masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
      routeName: selectedRoute,
      station: stationName,
      year: selectedYear,
    });

    const nextStationNo = String(result.stationNo || '').trim();
    const nextInspectDate = formatSheetDateText(result.latestDate);

    if (nextStationNo) setStationNo(nextStationNo);
    if (nextInspectDate) {
      setInspectDate(nextInspectDate);
      setCoverDateStatus("");
    } else {
      setCoverDateStatus(String(result.message || "選択年度の調査日が見つかりません"));
    }
  } catch (e) {
    console.error(e);
    setCoverDateStatus(`調査日の読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
  }
}, [selectedRoute, stationName, selectedYear]);

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
  if ((mode === 'karte_edit' && !isEditMode) || mode === 'slope_table' || mode === 'inclination_menu') {
    loadInspectionListDates();
  }
}, [mode, isEditMode, loadInspectionListDates]);

useEffect(() => {

  if (mode !== 'slope_table' && mode !== 'inclination_menu') return;
  if (!spreadsheetId) return;

  loadSlopeTable();

}, [mode, spreadsheetId]);

useEffect(() => {
  setInclinationPageIndex(0);
}, [mode, spreadsheetId]);

  // 駅や年度が変わったら入力をクリア
  useEffect(() => {
  if (mode === 'new_entry' || mode === 'karte_edit' || mode === 'inclination_edit') return;

  setSourceImage(null);
  setFinalImage(null);
  setMarkers([]); 
  setPhotos(Array(4).fill(null));
  setFirstPhotos(Array(4).fill(null));
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

    setIsLoading(false);

  }
};

  // 写真撮影ハンドラ
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (ev) => {

    const compressed = await resizeImage(ev.target?.result as string);

    const newPhotos = [...photos];
    newPhotos[index] = compressed;
    setPhotos(newPhotos);
  };

  reader.readAsDataURL(file);
};

  const handleFirstCapture = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (ev) => {

    const compressed = await resizeImage(ev.target?.result as string);

    const newPhotos = [...firstPhotos];
    newPhotos[index] = compressed;
    setFirstPhotos(newPhotos);
  };

  reader.readAsDataURL(file);
};

  const resizeImage = async (
    base64Str: string,
    maxSize = 900,
    maxBytes = 1000000,
    minQuality = 0.3,
    maxPixels = 1000000
  ): Promise<string> => {

  return new Promise((resolve) => {

    const img = new Image();
    img.src = base64Str;

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

  });

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

// --- 指定したNoのカルテデータを読み込む関数 ---
  const loadKarteData = async (no: string) => {
  if (!spreadsheetId) return;
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
      const d = toRecord(result.data);
      // 取得データをステートに反映
      setKarteNo(String(d.karteNo));
      setStructEval(getRecordText(d, ['structEval', 'structureEval', 'structuralEval']));
      setImpactEval(getRecordText(d, ['impactEval']));
      setTotalEval(getRecordText(d, ['totalEval', 'evaluation']));
      setPrevYearEval(getRecordText(d, ['prevYearEval', 'previousYearEval']));
      setFirstKarteNo(getRecordText(d, ['firstKarteNo', 'initialKarteNo']));
      setFirstDate(normalizeDateForDateInput(d.firstDate));
      setFirstInspector(getRecordText(d, ['firstInspector', 'initialInspector']));
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
      setInspector(getRecordText(d, ['inspector']));
      setRemarks1(getRecordText(d, ['remarks1', 'currentFinish', 'latestFinish']));
      setRemarks2(getRecordText(d, ['remarks2', 'currentSituation', 'latestSituation', 'situation']));
      setRemarks3(getRecordText(d, ['remarks3', 'currentDetail', 'latestDetail', 'detail']));

      setPhotos(normalizePhotoArray(
        d,
        ['photos', 'photoUrls', 'currentPhotos', 'currentPhotoUrls', 'latestPhotos', 'latestPhotoUrls'],
        ['photo', 'currentPhoto', 'latestPhoto']
      ));
      setFirstPhotos(normalizePhotoArray(
        d,
        ['firstPhotos', 'firstPhotoUrls', 'initialPhotos', 'initialPhotoUrls'],
        ['firstPhoto', 'initialPhoto']
      ));

      setIsEditMode(true);
      setMode('karte_edit');
    }
  } catch (e) {
    alert("読み込みエラーが発生しました");
  } finally {
    setIsLoading(false);
  }
};

  // --- 2. 送信ロジック（独立した関数として定義） ---
  const sendGenericKarte = async (actionType: "uploadKarte" | "uploadInclination") => {
    if (!karteNo || isSending) return;
    setIsSending(true);

    try {
      // 画像のリサイズ処理
      const photoDataList = await Promise.all(
  photos.map(async (p, index) => {
    if (p && p.startsWith("data:image")) {

      const resized = await resizeImage(p);

      return {
        no: index + 1,
        fileName: `${index + 1}.jpg`,
        base64: resized.includes(',')
          ? resized.split(',')[1]
          : resized
      };

    }

    return null;
  })
);

      const validPhotos = photoDataList.filter(Boolean);

const firstPhotoDataList = await Promise.all(
  firstPhotos.map(async (p, index) => {

    if (p && p.startsWith("data:image")) {

      const resized = await resizeImage(p);

      return {
        no: index + 1,
        fileName: `初回点検_${index + 1}.jpg`,
        base64: resized.includes(',')
          ? resized.split(',')[1]
          : resized
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
  firstDate,
  firstInspector,
  firstFinish,
  firstSituation,
  firstDetail,
  inspectDate,
  contractor,
  inspector,
  buildingCategory,
  inspectionPlace,
  locationDetail,
  remarks1,
  remarks2,
  remarks3,
  photoFiles: validPhotos,
  firstPhotoFiles: validFirstPhotos,
};

const result = await gasApi(actionType, payload);
      
      if (result.success) {
        alert(`スプレッドシートの更新が完了しました！ (No.${karteNo})`);
      } else {
        alert("保存に失敗しました: " + (result.error || "不明なエラー"));
      }
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました。");
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

    const [unavailableResult, existingResult] = await Promise.all([
      gasApi("getUnavailableKarteNumbers", { spreadsheetId }),
      gasApi("getKarteList", { spreadsheetId, type: "photo" })
    ]);

    const unavailable = Array.isArray(unavailableResult.list)
      ? unavailableResult.list.map((n: unknown) => String(n).trim()).filter(Boolean)
      : [];

    const existing = Array.isArray(existingResult.list)
      ? existingResult.list.map((n: unknown) => String(n).trim()).filter(Boolean)
      : [];

    const blocked = Array.from(new Set([...unavailable, ...existing]));

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
      slope: Array.isArray(result.groups?.slope) ? result.groups.slope : [],
      inclination: Array.isArray(result.groups?.inclination) ? result.groups.inclination : [],
      inspectionReport: Array.isArray(result.groups?.inspectionReport) ? result.groups.inspectionReport : [],
    };

    setPdfSheets(groups);

    const allSheetNames = [
      ...groups.cover,
      ...groups.photo,
      ...groups.slope,
      ...groups.inclination,
      ...groups.inspectionReport,
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

const createPdf = async () => {
  if (!spreadsheetId) return alert("スプレッドシートIDがありません");
  if (selectedPdfSheets.length === 0) return alert("PDF化するシートを選択してください");

  setIsSending(true);

  try {
    const pdfJobs = [
      { kind: "cover", suffix: "表紙", sheetNames: pdfSheets.cover.map(sheet => sheet.name) },
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

    const createdFiles = [];

    for (const job of pdfJobs) {
      const result = await gasApi("createInspectionPdf", {
        spreadsheetId,
        stationName,
        year: selectedYear,
        pdfKind: job.kind,
        fileSuffix: job.suffix,
        sheetNames: job.sheetNames,
      });

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
  (isSending || isLoading) ? (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[99999]">
      <div className="bg-white p-10 rounded-3xl flex flex-col items-center shadow-2xl">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>

        <p className="text-slate-900 font-bold text-lg">
          {isSending ? '保存しています...' : '読み込んでいます...'}
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
if (mode === 'edit_list') return (
  <div className="flex flex-col items-center justify-start min-h-screen bg-slate-100 p-6 text-black" style={routePageStyle}>

    <LoadingSpinner />

    <Nav />

    <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl">
      <h2 className="text-2xl font-bold mb-6 text-blue-700 text-center">修正するカルテを選択</h2>
      
      <div className="grid grid-cols-3 gap-4">
        {existingKartes.map(no => (
          <button
            key={no}
            // ★ ここを loadKarteData に書き換え！
            onClick={() => loadKarteData(String(no))} 
            className="p-4 bg-white border-2 border-blue-500 text-blue-700 rounded-xl font-bold shadow-sm active:bg-blue-500 active:text-white transition-all text-center"
          >
            No.{no}
          </button>
        ))}
      </div>

      <button onClick={goBack} className="w-full mt-8 py-3 bg-slate-200 rounded-xl font-bold text-slate-600">戻る</button>
    </div>
  </div>
);

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
            disabled={!stationName || !selectedYear}
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
    const previousYearLabel = Number.isFinite(Number(selectedYear))
      ? `${Number(selectedYear) - 1}年評価`
      : '前年度評価';

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

          <div className="mb-3 grid grid-cols-[220px_1fr_130px_1fr] border-2 border-slate-800 bg-white shadow-sm">
            <div className="border-r-2 border-slate-800 bg-slate-200 p-2 text-center font-bold">初回点検日</div>
            <textarea className="min-h-10 resize-y border-r-2 border-slate-800 px-2 py-3 text-center leading-5 outline-none" value={firstDate} onChange={e => setFirstDate(e.target.value)} rows={2} />
            <div className="border-r-2 border-slate-800 bg-slate-200 p-2 text-center font-bold">最新点検日</div>
            <textarea className="min-h-10 resize-y px-2 py-3 text-center leading-5 outline-none" value={inspectDate} onChange={e => setInspectDate(e.target.value)} rows={2} />
            <div className="border-r-2 border-t-2 border-slate-800 bg-slate-200 p-2 text-center font-bold">初回点検者</div>
            <textarea className="min-h-10 resize-y border-r-2 border-t-2 border-slate-800 px-2 py-3 text-center leading-5 outline-none" value={firstInspector} onChange={e => setFirstInspector(e.target.value)} rows={2} />
            <div className="border-r-2 border-t-2 border-slate-800 bg-slate-200 p-2 text-center font-bold">点検者</div>
            <textarea className="min-h-10 resize-y border-t-2 border-slate-800 px-2 py-3 text-center leading-5 outline-none" value={inspector} onChange={e => setInspector(e.target.value)} rows={2} />
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
            <div className="border-r border-b border-slate-900 p-2">初回評価</div>
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
                        {row[cell.field]}
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
                    <div className="grid grid-cols-5 gap-2">
                      {sheets.map(sheet => {
                        const checked = selectedPdfSheets.includes(sheet.name);

                        return (
                          <button
                            key={sheet.name}
                            type="button"
                            onClick={() => togglePdfSheet(sheet.name)}
                            className={`min-h-10 rounded-xl border px-2 py-2 text-sm font-black active:scale-95 ${
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

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={createPdf}
            disabled={isSending || selectedPdfSheets.length === 0}
            className="w-full max-w-md rounded-xl bg-blue-600 py-4 text-lg font-black text-white shadow active:scale-95 disabled:bg-slate-400"
          >
            {isSending ? "PDF作成中..." : "PDFを作成する"}
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
  setFirstInspector('');

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
  };

const getFinishOptions = () => {
  const key = String(inspectionPlace || '').trim();
  return key ? finishOptionsByPlace[key] || [] : [];
};

const getCheckItems = () => {
  const key = String(inspectionPlace || '').trim();
  return key ? checkItemsByPlace[key] || [] : [];
};

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

    if (!coverStationNo && selectedRoute && stationName && selectedYear) {
      const dateResult = await gasApi("getInspectionListDates", {
        masterSpreadsheetId: INSPECTION_LIST_MASTER_ID,
        routeName: selectedRoute,
        station: stationName,
        year: selectedYear,
      });
      coverStationNo = String(dateResult.stationNo || coverStationNo || '');
      if (coverStationNo) setStationNo(coverStationNo);
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
      firstDate,
      firstInspector,
      inspectDate,
      inspector,
      rows,
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
    let mergedFirstDate = "";
    let mergedInspectDate = "";
    let mergedFirstInspector = "";
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

      mergedFirstDate = mergeUniqueMultilineText(mergedFirstDate, header.firstDate);
      mergedInspectDate = mergeUniqueMultilineText(mergedInspectDate, header.inspectDate);
      mergedFirstInspector = mergeUniqueMultilineText(mergedFirstInspector, header.firstInspector);
      mergedInspector = mergeUniqueMultilineText(mergedInspector, header.inspector);

      setFirstDate(mergedFirstDate);
      setInspectDate(mergedInspectDate);
      setFirstInspector(mergedFirstInspector);
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
  setFirstDate(formatSheetDateText(dateResult.firstDate));
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
      setFirstDate(formatSheetDateText(data.firstDate));
      setInspectDate(formatSheetDateText(data.inspectDate));
      setFirstInspector(String(data.firstInspector || ''));
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
    if (result.evalType !== undefined && result.evalType !== null) {setEvalType(String(result.evalType));}
    setInspectList(result.inspectList || []);

    const loadedSlopeRows = Array.isArray(result.rows)
      ? result.rows.map((row: Partial<SlopeTableRow>, index: number) => normalizeSlopeRow(row, index))
      : createEmptySlopeRows();

    setSlopeRows(loadedSlopeRows);

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

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {

updateSlopePhoto(
  rowId,
  photoField,
  reader.result as string
);

  };

  reader.readAsDataURL(file);

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
    const fileId = photo.match(/[?&]id=([^&]+)/)?.[1] || photo.match(/\/d\/([^/]+)/)?.[1] || "";
    if (!fileId) return null;

    return {
      point,
      kind,
      fileName,
      fileId,
    };
  }

  const resized = await resizeImage(photo, 800, 350000, 0.4, 490000);

  return {
    point,
    kind,
    fileName,
    base64: resized.includes(',') ? resized.split(',')[1] : "",
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

<div className="mt-4 flex justify-center">
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

    <div
      className="w-full h-full cursor-pointer overflow-hidden"
      onClick={() =>
        document
          .getElementById(`slope-photo1-${row.id}`)
          ?.click()
      }
    >

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
      className="hidden"
      onChange={(e) =>
        handleSlopeCapture(e, row.id, 'photo1')
      }
    />

    {!!row.photo1 && (

      <button
        onClick={() =>
          updateSlopePhoto(row.id, 'photo1', null)
        }
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs"
      >
        ✕
      </button>

    )}

  </div>

  {/* 写真② */}
  <div className="relative aspect-[4/3] bg-slate-100 border-l border-slate-300">

    <div
      className="w-full h-full cursor-pointer overflow-hidden"
      onClick={() =>
        document
          .getElementById(`slope-photo2-${row.id}`)
          ?.click()
      }
    >

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
      className="hidden"
      onChange={(e) =>
        handleSlopeCapture(e, row.id, 'photo2')
      }
    />

    {!!row.photo2 && (

      <button
        onClick={() =>
          updateSlopePhoto(row.id, 'photo2', null)
        }
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs"
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
        <h2 className="text-2xl font-black mb-8">{isPhoto ? '写真カルテ' : '傾斜測定カルテ'}</h2>
        <div className="flex flex-col gap-6 w-full max-w-sm">
          {/* ① 新規作成ボタン */}
          <button 
            onClick={async () => {
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
    const finishOptions = getFinishOptions();
    const checkItems = getCheckItems();
    const inspectorSelectOptions =
      inspector && !inspectorOptions.includes(inspector)
        ? [inspector, ...inspectorOptions]
        : inspectorOptions;
    return (
      <div className="flex flex-col items-center justify-start min-h-screen bg-slate-300 text-black" style={routePageStyle}>
        <Nav />
        <LoadingOverlay />

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
      className={`w-full outline-none text-center font-black bg-white ${
        structEval === 'AA' || structEval === 'A1' || structEval === 'A2'
          ? 'text-red-600'
          : 'text-black'
      }`}
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
            <input 
            type="text" 
            className="bg-transparent outline-none placeholder-slate-400" 
            placeholder="2018/04/01" 
            value={firstDate || ''} // ★修正
            onChange={e => setFirstDate(e.target.value)} 
           />
          </div>
          <div className="p-1 flex flex-col">
          <span className="text-[9px] font-bold text-black">初回点検者</span>
          <input 
          type="text" 
          className="bg-transparent outline-none placeholder-slate-400" 
          placeholder="氏名" 
          value={firstInspector || ''} // ★修正 
          onChange={e => setFirstInspector(e.target.value)} 
           />
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

        return (
          <div key={index} className="relative aspect-[4/3]">
            <div
              className="w-full h-full bg-white rounded border border-slate-300 overflow-hidden cursor-pointer"
              onClick={() => firstFileInputs.current[index]?.click()}
            >
              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-cover"
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

            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={(el) => { firstFileInputs.current[index] = el }}
              onChange={(e) => handleFirstCapture(e, index)}
            />

            {!!p && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const n = [...firstPhotos];
                  n[index] = null;
                  setFirstPhotos(n);
                }}
                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white z-50"
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

        return (
          <div key={index} className="relative aspect-[4/3]">
            <div
              className="w-full h-full bg-white rounded border border-slate-300 overflow-hidden cursor-pointer"
              onClick={() => firstFileInputs.current[index]?.click()}
            >
              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-cover"
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

            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={(el) => { firstFileInputs.current[index] = el }}
              onChange={(e) => handleFirstCapture(e, index)}
            />

            {!!p && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const n = [...firstPhotos];
                  n[index] = null;
                  setFirstPhotos(n);
                }}
                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white z-50"
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
                <input type="date" className="outline-none text-black placeholder-slate-400" value={inspectDate} onChange={e => setInspectDate(e.target.value)} />
              </div>
<div className="p-1 flex flex-col bg-blue-50/30">
  <span className="text-[9px] text-blue-700">点検者</span>

  <select
    className="outline-none text-black bg-transparent text-[12px]"
    value={inspector}
    onChange={e => setInspector(e.target.value)}
  >
    <option value="">
      {inspectorOptions.length ? "点検者を選択" : "点検者未登録"}
    </option>
    {inspectorSelectOptions.map(option => (
      <option key={option} value={option}>
        {option}
      </option>
    ))}
  </select>
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

        return (
          <div key={index} className="relative aspect-[4/3]">

            <div
              className="w-full h-full bg-white rounded border border-blue-200 overflow-hidden cursor-pointer"
              onClick={() => fileInputs.current[index]?.click()}
            >

              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-cover"
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

            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={(el) => { fileInputs.current[index] = el }}
              onChange={(e) => handleCapture(e, index)}
            />

 {!!p && (
  <button
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      const n = [...photos];
      n[index] = null;
      setPhotos(n);
    }}
    className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white z-50"
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

        return (
          <div key={index} className="relative aspect-[4/3]">

            <div
              className="w-full h-full bg-white rounded border border-blue-200 overflow-hidden cursor-pointer"
              onClick={() => fileInputs.current[index]?.click()}
            >

              {p ? (
                <img
                  src={p}
                  className="w-full h-full object-cover"
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

            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={(el) => { fileInputs.current[index] = el }}
              onChange={(e) => handleCapture(e, index)}
            />

 {!!p && (
  <button
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      const n = [...photos];
      n[index] = null;
      setPhotos(n);
    }}
    className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white z-50"
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
        <div className="w-full bg-slate-800 p-3 flex justify-center sticky bottom-0 border-t border-slate-600">
          <button 
            onClick={() => sendGenericKarte(isPhoto ? "uploadKarte" : "uploadInclination")} 
            disabled={isSending}
            className="w-full max-w-xl py-3 bg-blue-600 text-white rounded-xl font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isSending ? "データを送信中..." : "この内容でスプレッドシートを更新"}
          </button>
        </div>
      </div>
    );
  }

  // --- 次のモード（editorなど）がここから始まる ---

// ★★★ ここに handleSaveMap を貼り付けます ★★★
  const handleSaveMap = async () => {
    if (!finalImage || isSending) return;
    setIsSending(true);
    try {
      const canvas = document.createElement('canvas');
      const img = imageRef.current;
      if (!img) return;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);

      markers.forEach(m => {
        const x = (m.x / 100) * canvas.width;
        const y = (m.y / 100) * canvas.height;
        const size = 30; 
        ctx.beginPath();
        ctx.lineWidth = 4;
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

      const combinedBase64 = canvas.toDataURL('image/png').split(',')[1];
      const payload = {
        action: "uploadPhotos",
        spreadsheetId,
        imageData: combinedBase64,
        stationNo: stationNo
      };

      await gasApi("saveMarkers", payload);
      alert("位置図を保存しました。");
    } catch (e) {
      alert("保存に失敗しました");
    } finally {
      setIsSending(false);
    }
  };

// --- 2. エディタ画面のUI部分 ---
if (mode === 'editor') {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-black" style={routePageStyle}>
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
      <div className="p-4 flex flex-col items-center">
        <Nav />
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black">{stationName}</h2>
          <p className="text-sm font-bold text-indigo-600 mt-1">写真カルテ番号位置図 編集</p>
        </div>

        {/* 上部操作パネル */}
  <div className="w-full max-w-2xl bg-white p-4 rounded-3xl shadow-sm mb-6 flex gap-2">
    {!sourceImage && !finalImage ? (
      <>
      {/* 駅No. 入力項目 */}
      <div className="w-full mb-4 px-2">
      <label className="block text-slate-700 font-bold mb-1 text-sm">駅No.</label>
     <input
      type="number"
      value={stationNo}
     onChange={(e) => setStationNo(e.target.value)}
      placeholder="数字を入力（例: 123）"
      className="w-full p-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 outline-none transition-all text-black"
  />
</div>
        <button onClick={() => window.open(`https://www.google.com/search?q=${stationName}+構内図&tbm=isch`, '_blank')} className="flex-1 p-4 bg-slate-800 text-white rounded-2xl font-bold">🔍 Web検索</button>
        <button onClick={async () => {
        setIsLoading(true); // ★ここでくるくるを開始
        try {
        const result = await gasApi("getMaps");
        const data = result.list;
        if (Array.isArray(data)) { 
        setDriveMaps(data); 
       setShowMapPicker(true); 
       }
        } catch (e) { 
       alert("マップの取得に失敗しました"); 
       } finally { 
        setIsLoading(false); // ★終わったらくるくるを消す
       }
        }} className="transition-all active:scale-95 active:brightness-90 flex-1 p-4 bg-emerald-600 text-white rounded-2xl font-bold">
        📂 ドライブ
        </button>
      </>
    ) : sourceImage && !finalImage ? (
      <button onClick={async () => {
              const img = new Image(); img.src = sourceImage!;
              await new Promise((resolve) => { img.onload = resolve; });
              const canvas = document.createElement('canvas');
              const cp = croppedAreaPixels;
              canvas.width = cp.width; canvas.height = cp.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, cp.x, cp.y, cp.width, cp.height, 0, 0, cp.width, cp.height);
                const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
                // モノクロ化 (白黒) 処理
                for (let i = 0; i < idata.data.length; i += 4) {
                  const g = idata.data[i] * 0.3 + idata.data[i + 1] * 0.59 + idata.data[i + 2] * 0.11;
                  idata.data[i] = idata.data[i + 1] = idata.data[i + 2] = g;
                }
                ctx.putImageData(idata, 0, 0);
                setFinalImage(canvas.toDataURL('image/png'));
              }
            }} className="transition-all active:scale-95 active:brightness-90 w-full p-4 bg-amber-500 text-white rounded-2xl font-bold shadow-lg">📌 この範囲で確定（モノクロ化）</button>
          ) : (
            <>
              <button onClick={() => { setFinalImage(null); setSourceImage(null); setMarkers([]); }} className="p-4 bg-slate-100 text-slate-500 rounded-2xl text-sm font-bold">🔄 画像変更</button>
        {/* 送信ボタン（アニメーション付き） */}
        <button 
          onClick={handleSaveMap} 
          disabled={isSending} 
          className={`transition-all active:scale-95 active:brightness-90 flex-1 p-4 rounded-2xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
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
            "💾 スプレッドシートへ送信"
          )}
        </button>
      </>
    )}
  </div>
        {/* メイン編集エリア */}
        <div className="relative w-full max-w-2xl bg-slate-200 rounded-3xl overflow-hidden flex items-center justify-center border-4 border-white mb-8" 
          style={{ minHeight: '60vh', touchAction: 'none' }}
        >
          {sourceImage && !finalImage && (
            <Cropper 
              image={sourceImage} 
              crop={crop} 
              zoom={zoom} 
              onCropChange={setCrop} 
              onCropComplete={(_, p) => setCroppedAreaPixels(p)} 
              onZoomChange={setZoom} 
              style={{ containerStyle: { background: '#e2e8f0' } }} 
            />
          )}

          {finalImage && (
            <div className="relative inline-block" 
              style={{ touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
              onContextMenu={(e) => e.preventDefault()} // 右クリック/ロングタップメニュー禁止
            >
              {/* 下地画像（ガード済み） */}
              <img 
                ref={imageRef} 
                src={finalImage} 
                className="max-w-full max-h-[70vh] rounded-lg pointer-events-none select-none" 
                draggable="false" 
              />
              
              {/* 透明クリックレイヤー（ガード兼マーク配置用） */}
              <div 
                className="absolute inset-0 z-20 cursor-crosshair"
                onClick={(e) => {
                  if (draggingMarkerId !== null || (e.target as HTMLElement).closest('.marker')) return;
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setTempPos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                  setEditingMarker(null);
                  setFormLabel(String(markers.length + 1));
                  setShowModal(true);
                }}
              >
                {markers.map(m => (
  <div key={m.id} 
    className="marker absolute flex items-center justify-center font-bold bg-white shadow-lg pointer-events-auto touch-none select-none"
    style={{ 
      left: `${m.x}%`, 
      top: `${m.y}%`, 
      transform: 'translate(-50%,-50%)', 
      width: '30px', 
      height: '30px', 
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
        {/* マーカー編集モーダル */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-[100] backdrop-blur-sm">
            <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl scale-in-center">
              <h3 className="text-xl font-bold mb-6 text-slate-800">{editingMarker ? 'マーカーを編集' : 'マーカーを追加'}</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">ラベル (No.)</label>
                  <input className="w-full p-4 bg-slate-100 rounded-2xl border-2 focus:border-indigo-500 outline-none text-lg font-bold" value={formLabel} onChange={e => setFormLabel(e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">カラー</label>
                  <div className="flex gap-4">
                    {(['red', 'black', '#5372fc'] as const).map(c => (
                      <button key={c} onClick={() => setFormColor(c)} className={`transition-all active:scale-95 active:brightness-90 w-12 h-12 rounded-full border-4 transition-transform ${formColor === c ? 'scale-110 border-slate-300' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">形状</label>
                  <div className="flex gap-4">
                    {([{id:'circle', n:'○'}, {id:'square', n:'□'}] as const).map(s => (
                      <button 
        key={s.id} 
        onClick={() => setFormShape(s.id)} 
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
              </div>

              <div className="flex gap-3 mt-10">
                {editingMarker && (
                  <button onClick={() => { setMarkers(prev => prev.filter(m => m.id !== editingMarker.id)); setShowModal(false); }} className="transition-all active:scale-95 active:brightness-90 flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-bold active:bg-rose-100">削除</button>
                )}
                <button onClick={() => {
                  if (editingMarker) {
                    setMarkers(prev => prev.map(m => m.id === editingMarker.id ? { ...m, label: formLabel, color: formColor, shape: formShape } : m));
                  } else {
                    setMarkers(prev => [...prev, { id: Date.now(), x: tempPos.x, y: tempPos.y, label: formLabel, color: formColor, shape: formShape }]);
                  }
                  setShowModal(false);
                }} className="transition-all active:scale-95 active:brightness-90 flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-transform">決定</button>
                <button onClick={() => setShowModal(false)} className="transition-all active:scale-95 active:brightness-90 absolute top-4 right-4 text-slate-300 hover:text-slate-500 text-2xl">✕</button>
              </div>
            </div>
          </div>
        )}

        {/* ドライブ画像選択モーダル */}
        {showMapPicker && (
          <div className="fixed inset-0 bg-white z-[110] flex flex-col p-6 animate-slide-up">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">ドライブから位置図を選択</h3>
              <button onClick={() => setShowMapPicker(false)} className="transition-all active:scale-95 active:brightness-90 text-2xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-10">
              {driveMaps.map(m => (
                <button key={m.id} onClick={async () => {
                  setIsLoading(true);
                  try {
                    const res = await fetch(GAS_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "getMapBase64",
    id: m.id
  })
});

const base64 = await res.text();
// ★ここに追加！！
if (!base64 || base64.startsWith("{")) {
  throw new Error("Base64取得失敗");
}

setSourceImage(`data:image/png;base64,${base64}`);
setShowMapPicker(false);

                  } catch (e) { alert("読込失敗"); } finally { setIsLoading(false); }
                }} className="transition-all active:scale-95 active:brightness-90 flex flex-col gap-2 p-2 bg-slate-50 rounded-xl active:bg-slate-200">
                  <img src={m.thumbUrl} className="w-full aspect-video object-cover rounded-lg shadow-sm" alt="" />
                  <span className="text-[10px] font-bold text-slate-600 truncate w-full text-left">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 最後に何も該当しない場合のフォールバック
  return null;
  } //
