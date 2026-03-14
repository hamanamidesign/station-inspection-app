type Props = {
  setMode: (mode: any) => void;
  Nav: any;
};

export default function TaskSelect({ setMode, Nav }: Props) {

  const tasks = [
    "表紙",
    "点検結果総括表",
    "施設点検報告書",
    "写真カルテ番号位置図",
    "写真カルテ",
    "傾斜測定カルテ"
  ];

  return (
    <div className="flex flex-col items-center p-6 bg-slate-50 min-h-screen text-black">
      
      <Nav back="menu" />

      <div className="grid grid-cols-2 gap-4 w-full max-w-lg">

        {tasks.map(task => (

          <button
            key={task}
            onClick={() => {
              if (task === "写真カルテ番号位置図") setMode('editor');
              else if (task === "写真カルテ") setMode('karte_menu');
              else if (task === "傾斜測定カルテ") setMode('inclination_menu');
            }}

            className={`transition-all active:scale-95 active:brightness-90 p-6 rounded-2xl shadow-md font-bold text-center border-2 ${
              ["写真カルテ番号位置図", "写真カルテ", "傾斜測定カルテ"].includes(task)
                ? "bg-white border-indigo-500 text-indigo-700"
                : "bg-slate-100 text-slate-400 opacity-60"
            }`}
          >
            {task}

          </button>

        ))}

      </div>

    </div>
  );
}