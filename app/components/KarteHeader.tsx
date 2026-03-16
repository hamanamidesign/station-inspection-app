"use client";

type Props = {
  karteNo: string;
  setKarteNo: (v: string) => void;
  stationName: string;
  selectedYear: string;

  structEval: string;
  setStructEval: (v: string) => void;

  impactEval: string;
  setImpactEval: (v: string) => void;

  totalEval: string;
  setTotalEval: (v: string) => void;

  prevYearEval: string;
  setPrevYearEval: (v: string) => void;
};

export default function KarteHeader({
  karteNo,
  setKarteNo,
  stationName,
  selectedYear,
  structEval,
  setStructEval,
  impactEval,
  setImpactEval,
  totalEval,
  setTotalEval,
  prevYearEval,
  setPrevYearEval
}: Props) {

  return (

<div className="w-full max-w-[99%] bg-white shadow-sm border-2 border-slate-800 mt-2 text-[11px]">

{/* タイトル行 */}
<div className="grid grid-cols-12 border-b-2 border-slate-800">

<div className="col-span-2 border-r-2 border-slate-800 p-2 bg-slate-100 flex items-center justify-center font-bold">
写真カルテ
</div>

<div className="col-span-2 border-r-2 border-slate-800 p-1">

<input
className="w-full h-full outline-none px-1 text-center font-black"
placeholder="No"
value={karteNo}
onChange={e=>setKarteNo(e.target.value)}
/>

</div>

<div className="col-span-6 border-r-2 border-slate-800 p-2 flex items-center px-4 font-black text-xl">
{stationName} 駅
</div>

<div className="col-span-2 p-2 bg-slate-100 flex items-center justify-center font-bold">
{selectedYear} 年度
</div>

</div>

{/* 評価 */}

<div className="grid grid-cols-12 bg-slate-100 font-bold text-center">

<div className="col-span-1 border-r p-2">
評価区分
</div>

<div className="col-span-2 border-r bg-white p-1">

<input
className="w-full outline-none text-center"
placeholder="構造"
value={structEval}
onChange={e=>setStructEval(e.target.value)}
/>

</div>

<div className="col-span-2 border-r bg-white p-1">

<input
className="w-full outline-none text-center"
placeholder="影響"
value={impactEval}
onChange={e=>setImpactEval(e.target.value)}
/>

</div>

<div className="col-span-2 border-r bg-white p-1">

<input
className="w-full outline-none text-center font-black text-indigo-700"
placeholder="総合"
value={totalEval}
onChange={e=>setTotalEval(e.target.value)}
/>

</div>

<div className="col-span-5 bg-white p-1">

<input
className="w-full outline-none text-center"
placeholder="前年度"
value={prevYearEval}
onChange={e=>setPrevYearEval(e.target.value)}
/>

</div>

</div>

</div>

  );
}