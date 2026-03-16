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
    <div className="w-full max-w-[95%] bg-white p-4 rounded-xl shadow">

      {/* カルテNo */}
      <div className="mb-4">
        <label className="text-xs font-bold text-slate-600">カルテNo</label>
        <input
          className="w-full border p-2 rounded"
          value={karteNo}
          onChange={(e) => setKarteNo(e.target.value)}
        />
      </div>

      {/* 評価 */}
      <div className="grid grid-cols-4 gap-2 mb-4">

        <input
          className="border p-2 rounded text-center"
          placeholder="構造"
          value={structEval}
          onChange={(e) => setStructEval(e.target.value)}
        />

        <input
          className="border p-2 rounded text-center"
          placeholder="影響"
          value={impactEval}
          onChange={(e) => setImpactEval(e.target.value)}
        />

        <input
          className="border p-2 rounded text-center"
          placeholder="総合"
          value={totalEval}
          onChange={(e) => setTotalEval(e.target.value)}
        />

        <input
          className="border p-2 rounded text-center"
          placeholder="前年度"
          value={prevYearEval}
          onChange={(e) => setPrevYearEval(e.target.value)}
        />
      </div>

      {/* 初回点検 */}
      <div className="mb-4">

        <div className="grid grid-cols-2 gap-2">

          <input
            type="text"
            placeholder="初回点検日"
            className="border p-2 rounded"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />

          <input
            type="text"
            placeholder="初回点検者"
            className="border p-2 rounded"
            value={firstInspector}
            onChange={(e) => setFirstInspector(e.target.value)}
          />

        </div>

        <textarea
          className="border p-2 rounded w-full mt-2"
          placeholder="初回備考"
          value={firstRemarks}
          onChange={(e) => setFirstRemarks(e.target.value)}
        />

      </div>

      {/* 今回点検 */}
      <div className="mb-4">

        <div className="grid grid-cols-2 gap-2">

          <input
            type="date"
            className="border p-2 rounded"
            value={inspectDate}
            onChange={(e) => setInspectDate(e.target.value)}
          />

          <input
            type="text"
            placeholder="施工者"
            className="border p-2 rounded"
            value={contractor}
            onChange={(e) => setContractor(e.target.value)}
          />

        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">

          <input
            type="text"
            placeholder="場所詳細"
            className="border p-2 rounded"
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
          />

          <input
            type="text"
            placeholder="点検者"
            className="border p-2 rounded"
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
          />

        </div>

        <textarea
          className="border p-2 rounded w-full mt-2"
          placeholder="備考"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />

      </div>

      {/* 写真グリッド */}
      <div className="mt-6">

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
  );
}