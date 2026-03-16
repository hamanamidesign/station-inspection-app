"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { gasApi } from "./lib/gasApi";
import Cropper from 'react-easy-crop';
import TaskSelect from "./components/TaskSelect";

interface Marker {
  id: number; x: number; y: number; label: string;
  color: 'red' | 'black' | '#5372fc'; shape: 'circle' | 'square';
}
interface ExistingStation { stationName: string; year: string; spreadsheetId?: string; }

// 赤い波線を消すために、使用するすべてのモード名をここで定義します
type AppMode = 
  | 'menu' 
  | 'new_entry' 
  | 'exist_select' 
  | 'task_select' 
  | 'karte_menu' 
  | 'karte_edit' 
  | 'inclination_menu' 
  | 'inclination_edit' 
  | 'edit_list' 
  | 'editor';

export default function InspectorApp() {
  const fileInputs = useRef<(HTMLInputElement | null)[]>([]);

  // 追加の入力項目用ステート
  const [structEval, setStructEval] = useState('');    // ① 構造度評価 (F3)
  const [impactEval, setImpactEval] = useState('');    // ② 影響評価 (I3)
  const [totalEval, setTotalEval] = useState('');     // 総合評価 (L3)
  const [prevYearEval, setPrevYearEval] = useState(''); // 前年度評価 (Q3)
  const [firstDate, setFirstDate] = useState('');      // 初回点検日 (F5)
  const [firstInspector, setFirstInspector] = useState(''); // 初回点検者 (F6)
  const [firstRemarks, setFirstRemarks] = useState(''); // 初回状況備考 (E7)
  // ★★★ ここまで ★★★

  // --- 共通ステート ---
  const [mode, setMode] = useState<AppMode>('menu');
  const [isLoading, setIsLoading] = useState(false); // ★ これを関数の上に持ってくる
  const [stationNo, setStationNo] = useState("");
  const [stationName, setStationName] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [existingData, setExistingData] = useState<ExistingStation[]>([]);
  const [isSending, setIsSending] = useState(false);
  // 長押し判定や移動状態を保持するRef
  const dragRef = useRef<{
  timer: NodeJS.Timeout | null;
  isMoved: boolean;
  startX: number;
  startY: number;
}>({ timer: null, isMoved: false, startX: 0, startY: 0 });

  // --- 修正・編集用ステート ---
  const [existingKartes, setExistingKartes] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedNo, setSelectedNo] = useState<string | null>(null); // 追加：選択されたNoを保持
  
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
  const [locationDetail, setLocationDetail] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photos, setPhotos] = useState<(string | null)[]>(Array(8).fill(null));
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const GAS_URL = "https://script.google.com/macros/s/AKfycbyLyGHlZ-v5lXMEibJKr50x_M7Al-3TRmmvp1Wnotxz4NCpu0EIzXJoyZvZnRW8c-IUXA/exec";

// --- 初期化 ---
  const refreshData = useCallback(async () => {

  setIsLoading(true);

  try {

    const result = await gasApi("getExistingData");

    if (result.success && Array.isArray(result.list)) {

      setExistingData(result.list);

    } else {

      setExistingData([]);

    }

  } catch (e) {

    console.error(e);
    setExistingData([]);

  } finally {

    setIsLoading(false);

  }

}, []);
  // ★ここに入れる
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  console.log(existingData)

  // 駅や年度が変わったら入力をクリア
  useEffect(() => {
    setSourceImage(null); setFinalImage(null); setMarkers([]); 
    setPhotos(Array(8).fill(null));
    setKarteNo('1'); setRemarks(''); setInspectDate('');
  }, [stationName, selectedYear]);

// --- ① 関数の定義エリア（コンポーネント内の return より上に書く） ---
const handleCreateNewSheet = async () => {
  if (!stationName || !selectedYear) return alert("駅名と年度を入力してください");

  const duplicate: any = existingData.find(
    (d: any) => d.stationName === stationName && String(d.year) === String(selectedYear)
  );

  if (duplicate) {
    if (confirm(`「${stationName}」の${selectedYear}年度は既に存在します。既存のデータを編集しますか？`)) {
      setSpreadsheetId(duplicate.spreadsheetId);
      setFolderId(duplicate.folderId || '');
      setMode('task_select'); 
      return;
    } else {
      return;
    }
  }

  // 重複がなければ新規作成実行
setIsLoading(true);

try {

  const result = await gasApi("createNew", {
    station: stationName,
    year: selectedYear
  });

  if (result.success) {
    setSpreadsheetId(result.spreadsheetId);
    setFolderId(result.folderId);
    setMode('task_select');
  }

} catch (e) {

  alert("作成に失敗しました");

} finally {

  setIsLoading(false);

}
};

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

  const resizeImage = async (base64Str: string): Promise<string> => {

  return new Promise((resolve) => {

    const img = new Image();
    img.src = base64Str;

    img.onload = () => {

      const MAX_SIZE = 900;

      let width = img.width;
      let height = img.height;

      if (width > height && width > MAX_SIZE) {
        height = height * (MAX_SIZE / width);
        width = MAX_SIZE;
      } 
      else if (height > MAX_SIZE) {
        width = width * (MAX_SIZE / height);
        height = MAX_SIZE;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);

      let quality = 0.6;
      let result = canvas.toDataURL("image/jpeg", quality);

      // 1MB以下になるまで圧縮
      while (result.length > 1000000 && quality > 0.3) {
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
  const removePhoto = (index: number) => {
    const newPhotos = [...photos];
    newPhotos[index] = null;
    setPhotos(newPhotos);
    };

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
      setMode("edit_list");

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
  karteNo: no
});
    
    if (result.success) {
      const d = result.data;
      // 取得データをステートに反映
      setKarteNo(String(d.karteNo));
      setStructEval(String(d.structEval || ''));
      setImpactEval(String(d.impactEval || ''));
      setTotalEval(String(d.totalEval || ''));
      setPrevYearEval(String(d.prevYearEval || ''));
      setFirstDate(String(d.firstDate || ''));
      setFirstInspector(String(d.firstInspector || ''));
      setFirstRemarks(String(d.firstRemarks || ''));
      setInspectDate(String(d.inspectDate || ''));
      setContractor(String(d.contractor || ''));
      setLocationDetail(String(d.locationDetail || ''));
      setInspector(String(d.inspector || ''));
      setRemarks(String(d.remarks || ''));

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
              fileName: `${index + 1}.jpg`,
              base64: resized.includes(',') ? resized.split(',')[1] : resized
            };
          }
          return null;
        })
      );

      const validPhotos = photoDataList.filter(Boolean);

      const payload = {
  isUpdate: isEditMode,
  spreadsheetId,
  folderId,
  station: (stationName || "").replace('駅', ''),
  year: selectedYear,
  karteNo: karteNo,
  structEval,
  impactEval,
  totalEval,
  prevYearEval,
  firstDate,
  firstInspector,
  firstRemarks,
  inspectDate,
  contractor,
  inspector,
  locationDetail,
  remarks,
  photoFiles: validPhotos,
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

     const handleMarkerDrag = (touchX: number, touchY: number) => {
    if (draggingMarkerId === null || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((touchX - rect.left) / rect.width) * 100;
    const y = ((touchY - rect.top) / rect.height) * 100;
    setMarkers(prev => prev.map(m =>
      m.id === draggingMarkerId ? { ...m, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } : m
    ));
  };

  const Nav = ({ back }: { back: AppMode }) => (
    <div className="w-full mb-4 px-2 shrink-0">
      <div className="flex justify-between mb-2">
        <button onClick={() => setMode(back)} className="transition-all active:scale-95 active:brightness-90 px-5 py-2 bg-slate-200 rounded-xl font-bold text-slate-700 text-sm">← 戻る</button>
        <button onClick={() => { setMode('menu'); setIsEditMode(false); }} className="transition-all active:scale-95 active:brightness-90 px-5 py-2 bg-slate-800 rounded-xl font-bold text-white text-sm">🏠 ホーム</button>
      </div>
      
      {/* 現場名と年度を表示するヘッダー */}
      {(stationName || selectedYear) && (
        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-2 rounded-r-lg shadow-sm mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold text-indigo-400">現場:</span>
            <span className="text-sm font-black text-indigo-900">{stationName || "---"}</span>
            <span className="text-[10px] font-bold text-indigo-400 ml-2">年度:</span>
            <span className="text-sm font-black text-indigo-900">{selectedYear || "---"}</span>
          </div>
        </div>
      )}
    </div>
  );

  // --- 送信中のくるくるアニメーション（全画面共通） ---
  const LoadingOverlay = () => isSending ? (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center z-[99999]">
      <div className="bg-white p-10 rounded-3xl flex flex-col items-center shadow-2xl">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-900 font-bold text-lg">保存しています...</p>
        <p className="text-slate-500 text-sm">そのままお待ちください</p>
      </div>
    </div>
  ) : null;

  // --- 画面表示 ---

  // 1. メインメニュー画面
  if (mode === 'menu') return (
    <div className="flex flex-col items-center justify-start h-screen gap-8 bg-slate-50 text-black p-6">
      <h1 className="text-3xl font-black mb-4 text-center">施設点検システム</h1>
      <button onClick={() => setMode('new_entry')} className="transition-all active:scale-95 active:brightness-90 w-full max-w-xs py-10 bg-indigo-600 text-white rounded-3xl shadow-xl text-xl font-bold">➕ 新規現場を開始</button>
      <button onClick={() => setMode('exist_select')} className="transition-all active:scale-95 active:brightness-90 w-full max-w-xs py-10 bg-emerald-600 text-white rounded-3xl shadow-xl text-xl font-bold">📂 既存現場を編集</button>
    </div>
  );

  // 2. 作成済みカルテの一覧選択画面
  // --- 画面表示 (edit_list部分) ---
if (mode === 'edit_list') return (
  <div className="flex flex-col items-center justify-start min-h-screen bg-slate-100 p-6 text-black">
    <Nav back="karte_menu" />
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
      
      {isLoading && (
        <div className="mt-4 text-center text-blue-600 font-bold animate-pulse">
          データを読み込んでいます...
        </div>
      )}

      <button onClick={() => setMode('karte_menu')} className="w-full mt-8 py-3 bg-slate-200 rounded-xl font-bold text-slate-600">戻る</button>
    </div>
  </div>
);

  // 3. 現場名入力 / 選択画面
  if (mode === 'new_entry' || mode === 'exist_select') return (
    <div className="flex flex-col items-center justify-start h-screen bg-slate-50 p-6 text-black">
      <Nav back="menu" />
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-black">
        <h2 className={`text-2xl font-bold mb-6 ${mode === 'new_entry' ? 'text-indigo-700' : 'text-emerald-700'}`}>
          {mode === 'new_entry' ? '新規現場登録' : '既存現場を選択'}
        </h2>

        {/* --- 駅名入力/選択エリア --- */}
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-500 mb-1 ml-2">駅名</label>
          {mode === 'new_entry' ? (
            <input 
              className="w-full p-4 bg-white rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 transition-all shadow-sm" 
              placeholder="新しい駅名を入力" 
              value={stationName} 
              onChange={e => setStationName(e.target.value)} 
            />
          ) : (
            <select 
              className="w-full p-4 bg-white rounded-xl border-2 border-slate-200 outline-none focus:border-emerald-500 transition-all cursor-pointer shadow-sm"
              value={stationName}
              onChange={(e) => {
                setStationName(e.target.value);
                setSelectedYear(''); 
              }}
            >
              <option value="">-- 駅を選択 --</option>
              {Array.from(new Set(existingData.map(d => d.stationName))).filter(Boolean).sort().map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>

        {/* --- 年度入力/選択エリア --- */}
        <div className="mb-8">
          <label className="block text-xs font-bold text-slate-500 mb-1 ml-2">年度</label>
          {mode === 'new_entry' ? (
            <input 
              className="w-full p-4 bg-white rounded-xl border-2 border-slate-200" 
              placeholder="例: 2026" 
              value={selectedYear} 
              onChange={e => setSelectedYear(e.target.value)} 
            />
          ) : (
            <select 
              className="w-full p-4 bg-white rounded-xl border-2 border-slate-200"
              value={selectedYear}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedYear(val);
                // 選択した駅名と年度に一致するspreadsheetIdをセット
                const target = existingData.find(d => d.stationName === stationName && String(d.year) === val);
                if (target?.spreadsheetId) setSpreadsheetId(target.spreadsheetId);
              }}
              disabled={!stationName}
            >
              <option value="">-- 年度を選択 --</option>
              {existingData
                .filter(d => d.stationName === stationName)
                .map((d, i) => (
                  <option key={i} value={String(d.year)}>{d.year}年度</option>
                ))}
            </select>
          )}
        </div>

        {/* --- 実行ボタン --- */}
        <button 
          onClick={() => {
            if (mode === 'new_entry') {
              handleCreateNewSheet();
            } else {
              // 既存現場選択時はそのままタスク選択画面へ
              setMode('task_select'); 
            }
          }} 
          disabled={isLoading || !stationName || !selectedYear}
          className={`transition-all active:scale-95 w-full py-5 rounded-2xl font-bold text-xl text-white shadow-lg ${
            isLoading || !stationName || !selectedYear
              ? 'bg-slate-400 cursor-not-allowed' 
              : mode === 'new_entry' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>通信中...</span>
            </div>
          ) : (
            mode === 'new_entry' ? '新規作成して開始' : 'この現場を編集'
          )}
        </button>
      </div>
    </div>
  );

  if (mode === 'task_select') {
  return <TaskSelect setMode={setMode} Nav={Nav} />;
}
      
// 入力内容をすべて空にする関数
const resetKarteFields = () => {
  setLocationDetail('');         // 箇所詳細を空に
  setRemarks('');                // 備考を空に
  // その他、点検者や施工者もリセットが必要ならここに追加
};
 if (mode === 'karte_menu' || mode === 'inclination_menu') {
    const isPhoto = mode === 'karte_menu';
    return (
      <div className="flex flex-col items-center justify-start h-screen bg-slate-50 p-6 text-black">
        <Nav back="task_select" />
        <h2 className="text-2xl font-black mb-8">{isPhoto ? '写真カルテ' : '傾斜測定カルテ'}</h2>
        <div className="flex flex-col gap-6 w-full max-w-sm">
          {/* ① 新規作成ボタン */}
          <button 
            onClick={() => {resetKarteFields(); // ★ ここで入力をリセット！ 
              setIsEditMode(false); setMode(isPhoto ? 'karte_edit' : 'inclination_edit'); }} 
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
      setMode('edit_list'); // 一旦リスト画面へ飛ばすのが親切です
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
    return (
      <div className="flex flex-col items-center justify-start min-h-screen bg-slate-300 text-black">
        <Nav back={isPhoto ? "karte_menu" : "inclination_menu"} />
        <LoadingOverlay />

        {/* --- スプレッドシート再現ヘッダー (線の色を slate-800 で統一) --- */}
        <div className="w-full max-w-[99%] bg-white shadow-sm border-2 border-slate-800 mt-2 text-[11px]">
          {/* 1-2行目：タイトルと駅名 */}
          <div className="grid grid-cols-12 border-b-2 border-slate-800">
            <div className="col-span-2 border-r-2 border-slate-800 p-2 bg-slate-100 flex items-center justify-center font-bold">写真カルテ</div>
            <div className="col-span-2 border-r-2 border-slate-800 p-1 bg-white">
              <input 
                className="w-full h-full outline-none px-1 text-center font-black text-black placeholder-slate-400" 
                placeholder="No.入力" 
                value={karteNo} 
                onChange={e => setKarteNo(e.target.value)}
              />
            </div>
            <div className="col-span-6 border-r-2 border-slate-800 p-2 flex items-center px-4 font-black text-xl bg-white text-black">
              {stationName || "未選択"} 駅
            </div>
            <div className="col-span-2 p-2 bg-slate-100 flex items-center justify-center font-bold text-black italic text-sm">
              {selectedYear} 年度
            </div>
          </div>

          {/* 3-4行目：各評価項目 */}
          <div className="grid grid-cols-12 bg-slate-100 font-bold text-center border-b border-slate-800">
          <div className="col-span-1 border-r border-slate-800 p-2 flex items-center justify-center text-black">評価区分</div>
  
          <div className="col-span-2 border-r border-slate-800 bg-white p-1">
          <div className="text-[9px] text-black mb-1">① 構造度評価</div>
          <input 
         className="w-full outline-none text-center text-black placeholder-slate-400 font-normal" 
         placeholder="A" 
          value={structEval || ''} // ★修正
          onChange={e => setStructEval(e.target.value)} 
          />
          </div>
  
          <div className="col-span-2 border-r border-slate-800 bg-white p-1">
          <div className="text-[9px] text-black mb-1">② 影響評価</div>
          <input 
         className="w-full outline-none text-center text-black placeholder-slate-400 font-normal" 
          placeholder="1" 
          value={impactEval || ''} // ★修正
          onChange={e => setImpactEval(e.target.value)} 
          />
          </div>
  
          <div className="col-span-2 border-r border-slate-800 bg-white p-1">
          <div className="text-[9px] text-black mb-1">総合評価</div>
          <input 
         className="w-full outline-none text-center font-black text-indigo-700 placeholder-slate-400" 
          placeholder="A1" 
          value={totalEval || ''} // ★修正 
          onChange={e => setTotalEval(e.target.value)} 
          />
          </div>
  
          <div className="col-span-5 bg-white p-1">
          <div className="text-[9px] text-black mb-1">前年度評価</div>
          <input 
          className="w-full outline-none text-center text-black placeholder-slate-400 font-normal" 
          placeholder="B2" 
          value={prevYearEval || ''} // ★修正 
          onChange={e => setPrevYearEval(e.target.value)} 
          />
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
            <div className="grid grid-cols-2 text-[11px] border-b border-slate-800">
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

        <div className="p-2 border-b border-slate-800 h-24 flex flex-col">
        <div className="text-[9px] font-bold text-black mb-1">状況（備考）</div>
        <textarea 
        className="w-full flex-1 bg-transparent outline-none text-[12px] resize-none leading-tight placeholder-slate-400" 
        placeholder="過去の特記事項を入力" 
        value={firstRemarks || ''} // ★修正 
        onChange={e => setFirstRemarks(e.target.value)} 
        />
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
                <span className="text-[9px] text-blue-700">点検受注者</span>
                <input type="text" className="outline-none text-black placeholder-slate-400" placeholder="会社名" value={contractor} onChange={e => setContractor(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 text-[11px] border-b border-slate-800 font-bold">
              <div className="border-r border-slate-300 p-1 flex flex-col">
                <span className="text-[9px] text-blue-700">点検場所の詳細</span>
                <input type="text" className="outline-none text-black placeholder-slate-400" placeholder="1F 待合室付近" value={locationDetail} onChange={e => setLocationDetail(e.target.value)} />
              </div>
              <div className="p-1 flex flex-col bg-blue-50/30">
                <span className="text-[9px] text-blue-700">点検者</span>
                <input type="text" className="outline-none text-black placeholder-slate-400" placeholder="氏名" value={inspector} onChange={e => setInspector(e.target.value)} />
              </div>
            </div>

            {/* 今回の状況（備考） */}
            <div className="p-2 border-b border-slate-800 h-24 bg-blue-50/20 font-bold">
              <label className="text-[9px] text-blue-700 block mb-1">状況（備考）</label>
              <textarea 
                className="w-full h-16 outline-none bg-transparent text-[13px] resize-none leading-tight text-black placeholder-slate-400" 
                placeholder="変状、進行状況等を入力"
                value={remarks} 
                onChange={e => setRemarks(e.target.value)} 
              />
            </div>

{/* 今回の写真撮影エリア */}
<div className="flex-1 p-2 overflow-y-auto bg-blue-50/10">

  <div className="text-center text-[10px] font-black text-blue-700 mb-2 border-b border-blue-200">
    今回の点検写真
  </div>

  {/* 1〜4 */}
  <div className="border border-black rounded p-2 mb-3">
    <div className="grid grid-cols-2 gap-3">

      {photos.slice(0,4).map((p, i) => {
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
                  No.{index + 1}
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

  {/* 5〜8 */}
  <div className="border border-black rounded p-2">
    <div className="grid grid-cols-2 gap-3">

      {photos.slice(4,8).map((p, i) => {
        const index = i + 4;

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
                  No.{index + 1}
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

          </div>
        );
      })}

    </div>
  </div>

</div>
          </div>
        </div>

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

// --- 2. エディタ画面のUI部分 ---
if (mode === 'editor') {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-black">
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
        <Nav back="task_select" />
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
                    const res = await fetch(`${GAS_URL}?action=getMapBase64&id=${m.id}`);
                    const base64 = await res.text();
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


