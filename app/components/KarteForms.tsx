"use client";

import PhotoGrid from "./PhotoGrid";

type Props = {
  karteNo: string;
  setKarteNo: (v: string) => void;

  structEval: string;
  setStructEval: (v: string) => void;

  impactEval: string;
  setImpactEval: (v: string) => void;

  totalEval: string;
  setTotalEval: (v: string) => void;

  prevYearEval: string;
  setPrevYearEval: (v: string) => void;

  firstDate: string;
  setFirstDate: (v: string) => void;

  firstInspector: string;
  setFirstInspector: (v: string) => void;

  firstRemarks: string;
  setFirstRemarks: (v: string) => void;

  inspectDate: string;
  setInspectDate: (v: string) => void;

  contractor: string;
  setContractor: (v: string) => void;

  locationDetail: string;
  setLocationDetail: (v: string) => void;

  inspector: string;
  setInspector: (v: string) => void;

  remarks: string;
  setRemarks: (v: string) => void;

  photos: (string | null)[];
  setPhotos: (p: (string | null)[]) => void;

  fileInputs: any;
  handleCapture: any;

  handlePressStart: any;
  handlePressEnd: any;

  previewPhoto: string | null;
  setPreviewPhoto: (v: string | null) => void;
};

export default function KarteForms({
  karteNo,
  setKarteNo,
  structEval,
  setStructEval,
  impactEval,
  setImpactEval,
  totalEval,
  setTotalEval,
  prevYearEval,
  setPrevYearEval,
  firstDate,
  setFirstDate,
  firstInspector,
  setFirstInspector,
  firstRemarks,
  setFirstRemarks,
  inspectDate,
  setInspectDate,
  contractor,
  setContractor,
  locationDetail,
  setLocationDetail,
  inspector,
  setInspector,
  remarks,
  setRemarks,
  photos,
  setPhotos,
  fileInputs,
  handleCapture,
  handlePressStart,
  handlePressEnd,
  previewPhoto,
  setPreviewPhoto
}: Props) {

  return (

<div className="w-full max-w-[1400px] bg-white p-4 rounded shadow">

{/* タイトル */}
<div className="flex items-center mb-2">
  <div className="font-bold text-lg mr-4">写真カルテ</div>

  <input
    className="border p-1 w-24"
    value={karteNo}
    onChange={(e)=>setKarteNo(e.target.value)}
  />

  <div className="ml-4 text-sm">駅</div>
</div>


{/* 評価 */}
<div className="grid grid-cols-5 gap-2 mb-3">

<div className="text-xs text-center">①構造</div>
<div className="text-xs text-center">②影響</div>
<div className="text-xs text-center">総合</div>
<div className="text-xs text-center">前年度</div>

</div>

<div className="grid grid-cols-4 gap-2 mb-4">

<input className="border p-1 text-center"
value={structEval}
onChange={(e)=>setStructEval(e.target.value)}
/>

<input className="border p-1 text-center"
value={impactEval}
onChange={(e)=>setImpactEval(e.target.value)}
/>

<input className="border p-1 text-center"
value={totalEval}
onChange={(e)=>setTotalEval(e.target.value)}
/>

<input className="border p-1 text-center"
value={prevYearEval}
onChange={(e)=>setPrevYearEval(e.target.value)}
/>

</div>


{/* 2カラム */}
<div className="grid grid-cols-2 gap-4">

{/* 左：初回点検 */}
<div className="border p-2">

<div className="text-xs font-bold mb-2">初回点検</div>

<div className="grid grid-cols-2 gap-2 mb-2">

<input
placeholder="初回点検日"
className="border p-1"
value={firstDate}
onChange={(e)=>setFirstDate(e.target.value)}
/>

<input
placeholder="点検者"
className="border p-1"
value={firstInspector}
onChange={(e)=>setFirstInspector(e.target.value)}
/>

</div>

<textarea
className="border p-1 w-full mb-2"
placeholder="状況（備考）"
value={firstRemarks}
onChange={(e)=>setFirstRemarks(e.target.value)}
/>

<div className="border h-[350px] flex items-center justify-center text-xs">
初回点検写真
</div>

</div>



{/* 右：今回点検 */}
<div className="border p-2">

<div className="text-xs font-bold mb-2">今回点検</div>

<div className="grid grid-cols-2 gap-2 mb-2">

<input
type="date"
className="border p-1"
value={inspectDate}
onChange={(e)=>setInspectDate(e.target.value)}
/>

<input
placeholder="施工者"
className="border p-1"
value={contractor}
onChange={(e)=>setContractor(e.target.value)}
/>

</div>

<div className="grid grid-cols-2 gap-2 mb-2">

<input
placeholder="場所詳細"
className="border p-1"
value={locationDetail}
onChange={(e)=>setLocationDetail(e.target.value)}
/>

<input
placeholder="点検者"
className="border p-1"
value={inspector}
onChange={(e)=>setInspector(e.target.value)}
/>

</div>

<textarea
className="border p-1 w-full mb-2"
placeholder="状況（備考）"
value={remarks}
onChange={(e)=>setRemarks(e.target.value)}
/>

<PhotoGrid
photos={photos}
setPhotos={setPhotos}
fileInputs={fileInputs}
handleCapture={handleCapture}
handlePressStart={handlePressStart}
handlePressEnd={handlePressEnd}
setPreviewPhoto={setPreviewPhoto}
/>

</div>

</div>

</div>
  );
}