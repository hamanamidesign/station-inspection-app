"use client";

type Props = {
  isSending:boolean
  onSave:()=>void
}

export default function SaveBar({isSending,onSave}:Props){

return(

<div className="w-full bg-slate-800 p-3 flex justify-center sticky bottom-0">

<button

onClick={onSave}

disabled={isSending}

className="w-full max-w-xl py-3 bg-blue-600 text-white rounded-xl font-black text-lg"

>

{isSending ? "送信中..." : "スプレッドシート更新"}

</button>

</div>

)

}