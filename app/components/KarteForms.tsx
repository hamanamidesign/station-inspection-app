"use client";

type Props = {

karteNo: string
setKarteNo:(v:string)=>void

stationName:string
selectedYear:string

structEval:string
setStructEval:(v:string)=>void

impactEval:string
setImpactEval:(v:string)=>void

totalEval:string
setTotalEval:(v:string)=>void

prevYearEval:string
setPrevYearEval:(v:string)=>void

firstDate:string
setFirstDate:(v:string)=>void

firstInspector:string
setFirstInspector:(v:string)=>void

firstRemarks:string
setFirstRemarks:(v:string)=>void

inspectDate:string
setInspectDate:(v:string)=>void

contractor:string
setContractor:(v:string)=>void

locationDetail:string
setLocationDetail:(v:string)=>void

inspector:string
setInspector:(v:string)=>void

remarks:string
setRemarks:(v:string)=>void

photos:(string|null)[]
setPhotos:React.Dispatch<React.SetStateAction<(string|null)[]>>

fileInputs: React.MutableRefObject<(HTMLInputElement | null)[]>
handleCapture:any

handlePressStart:any
handlePressEnd:any

previewPhoto:string|null
setPreviewPhoto:(v:string|null)=>void
}

export default function KarteForms({

karteNo,setKarteNo,
stationName,selectedYear,

structEval,setStructEval,
impactEval,setImpactEval,
totalEval,setTotalEval,
prevYearEval,setPrevYearEval,

firstDate,setFirstDate,
firstInspector,setFirstInspector,
firstRemarks,setFirstRemarks,

inspectDate,setInspectDate,
contractor,setContractor,
locationDetail,setLocationDetail,
inspector,setInspector,
remarks,setRemarks,

photos,setPhotos,
fileInputs,handleCapture,

handlePressStart,handlePressEnd,

previewPhoto,setPreviewPhoto

}:Props){

return(

<>

{/* ===== ヘッダー ===== */}

<div className="w-full max-w-[99%] bg-white shadow-sm border-2 border-slate-800 mt-2 text-[11px]">

<div className="grid grid-cols-12 border-b-2 border-slate-800">

<div className="col-span-2 border-r-2 border-slate-800 p-2 bg-slate-100 flex items-center justify-center font-bold">
写真カルテ
</div>

<div className="col-span-2 border-r-2 border-slate-800 p-1 bg-white">
<input
className="w-full h-full outline-none px-1 text-center font-black"
placeholder="No.入力"
value={karteNo}
onChange={e=>setKarteNo(e.target.value)}
/>
</div>

<div className="col-span-6 border-r-2 border-slate-800 p-2 flex items-center px-4 font-black text-xl">
{stationName || "未選択"} 駅
</div>

<div className="col-span-2 p-2 bg-slate-100 flex items-center justify-center font-bold italic text-sm">
{selectedYear} 年度
</div>

</div>


{/* 評価 */}

<div className="grid grid-cols-12 bg-slate-100 font-bold text-center border-b border-slate-800">

<div className="col-span-1 border-r border-slate-800 p-2 flex items-center justify-center">
評価区分
</div>

<div className="col-span-2 border-r border-slate-800 bg-white p-1">

<div className="text-[9px] mb-1">① 構造度評価</div>

<input
className="w-full outline-none text-center"
placeholder="A"
value={structEval||''}
onChange={e=>setStructEval(e.target.value)}
/>

</div>


<div className="col-span-2 border-r border-slate-800 bg-white p-1">

<div className="text-[9px] mb-1">② 影響評価</div>

<input
className="w-full outline-none text-center"
placeholder="1"
value={impactEval||''}
onChange={e=>setImpactEval(e.target.value)}
/>

</div>


<div className="col-span-2 border-r border-slate-800 bg-white p-1">

<div className="text-[9px] mb-1">総合評価</div>

<input
className="w-full outline-none text-center font-black text-indigo-700"
placeholder="A1"
value={totalEval||''}
onChange={e=>setTotalEval(e.target.value)}
/>

</div>


<div className="col-span-5 bg-white p-1">

<div className="text-[9px] mb-1">前年度評価</div>

<input
className="w-full outline-none text-center"
placeholder="B2"
value={prevYearEval||''}
onChange={e=>setPrevYearEval(e.target.value)}
/>

</div>

</div>

</div>


{/* ===== メイン左右エリア ===== */}

<div className="w-full max-w-[99%] bg-white flex-1 grid grid-cols-2 divide-x-2 divide-slate-800 border-x-2 border-b-2 border-slate-800 mb-4 overflow-hidden">

{/* ===== 左：初回点検 ===== */}

<div className="flex flex-col h-full bg-slate-50">

<div className="bg-slate-700 text-white text-[10px] font-bold p-1 text-center uppercase tracking-widest">
初回点検（過去参照・編集）
</div>

<div className="grid grid-cols-2 text-[11px] border-b border-slate-800">

<div className="p-1 border-r border-slate-400 flex flex-col">

<span className="text-[9px] font-bold">初回点検日</span>

<input
type="text"
className="bg-transparent outline-none"
placeholder="2018/04/01"
value={firstDate||''}
onChange={e=>setFirstDate(e.target.value)}
/>

</div>


<div className="p-1 flex flex-col">

<span className="text-[9px] font-bold">初回点検者</span>

<input
type="text"
className="bg-transparent outline-none"
placeholder="氏名"
value={firstInspector||''}
onChange={e=>setFirstInspector(e.target.value)}
/>

</div>

</div>


<div className="p-2 border-b border-slate-800 h-24 flex flex-col">

<div className="text-[9px] font-bold mb-1">
状況（備考）
</div>

<textarea
className="w-full flex-1 bg-transparent outline-none text-[12px] resize-none"
placeholder="過去の特記事項を入力"
value={firstRemarks||''}
onChange={e=>setFirstRemarks(e.target.value)}
/>

</div>

</div>


{/* ===== 右：今回点検 ===== */}

<div className="flex flex-col h-full bg-white">

<div className="bg-blue-800 text-white text-[10px] font-bold p-1 text-center uppercase tracking-widest">
今回の点検状況を入力
</div>


<div className="grid grid-cols-2 text-[11px] border-b border-slate-800 font-bold">

<div className="border-r border-slate-300 p-1 flex flex-col">

<span className="text-[9px] text-blue-700">
最新点検日
</span>

<input
type="date"
className="outline-none"
value={inspectDate}
onChange={e=>setInspectDate(e.target.value)}
/>

</div>


<div className="p-1 flex flex-col bg-blue-50/30">

<span className="text-[9px] text-blue-700">
点検受注者
</span>

<input
type="text"
className="outline-none"
placeholder="会社名"
value={contractor}
onChange={e=>setContractor(e.target.value)}
/>

</div>

</div>


<div className="grid grid-cols-2 text-[11px] border-b border-slate-800 font-bold">

<div className="border-r border-slate-300 p-1 flex flex-col">

<span className="text-[9px] text-blue-700">
点検場所の詳細
</span>

<input
type="text"
className="outline-none"
placeholder="1F 待合室付近"
value={locationDetail}
onChange={e=>setLocationDetail(e.target.value)}
/>

</div>


<div className="p-1 flex flex-col bg-blue-50/30">

<span className="text-[9px] text-blue-700">
点検者
</span>

<input
type="text"
className="outline-none"
placeholder="氏名"
value={inspector}
onChange={e=>setInspector(e.target.value)}
/>

</div>

</div>


<div className="p-2 border-b border-slate-800 h-24 bg-blue-50/20 font-bold">

<label className="text-[9px] text-blue-700 block mb-1">
状況（備考）
</label>

<textarea
className="w-full h-16 outline-none bg-transparent text-[13px] resize-none"
placeholder="変状、進行状況等を入力"
value={remarks}
onChange={e=>setRemarks(e.target.value)}
/>

</div>



{/* ===== 写真エリア ===== */}

<div className="flex-1 p-2 overflow-y-auto bg-blue-50/10">

<div className="text-center text-[10px] font-black text-blue-700 mb-2">
今回の点検写真
</div>

{[0,4].map(start=>(
<div key={start} className="border border-black rounded p-2 mb-3">

<div className="grid grid-cols-2 gap-3">

{photos.slice(start,start+4).map((p,i)=>{

const index=start+i

return(

<div key={index} className="relative aspect-[4/3]">

<div
className="w-full h-full bg-white rounded border border-blue-200 overflow-hidden cursor-pointer"
onClick={()=>fileInputs.current[index]?.click()}
>

{p?

<img
src={p}
className="w-full h-full object-cover"
onMouseDown={()=>handlePressStart(p)}
onMouseUp={handlePressEnd}
onMouseLeave={handlePressEnd}
onTouchStart={()=>handlePressStart(p)}
onTouchEnd={handlePressEnd}
/>

:

<div className="flex items-center justify-center h-full text-[10px] text-blue-300 font-bold">
No.{index+1}
</div>

}

</div>


<input
type="file"
accept="image/*"
className="hidden"
ref={(el) => {
  fileInputs.current[index] = el
}}
onChange={(e)=>handleCapture(e,index)}
/>


{!!p&&(

<button
onClick={(e)=>{
e.preventDefault()
e.stopPropagation()

setPhotos(prev=>{
 const n=[...prev]
 n[index]=null
 return n
})

}}
className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-lg border border-white z-50"
>

✕

</button>

)}

</div>

)

})}

</div>

</div>
))}

</div>

</div>

</div>


{/* ===== 画像プレビュー ===== */}

{previewPhoto && (

<div
className="fixed inset-0 bg-black/80 flex items-center justify-center z-[999]"
onClick={()=>setPreviewPhoto(null)}
>

<img
src={previewPhoto}
className="max-w-[95%] max-h-[95%] object-contain rounded"
/>

</div>

)}

</>

)

}