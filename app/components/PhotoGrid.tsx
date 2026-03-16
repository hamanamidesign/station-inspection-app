"use client";

type Props = {
  photos: (string | null)[];
  setPhotos: (p: (string | null)[]) => void;
  fileInputs: any;
  handleCapture: any;
  handlePressStart: any;
  handlePressEnd: any;
  setPreviewPhoto: (v: string | null) => void;
};

export default function PhotoGrid({
  photos,
  setPhotos,
  fileInputs,
  handleCapture,
  handlePressStart,
  handlePressEnd,
  setPreviewPhoto
}: Props) {

  const renderPhoto = (p: string | null, index: number) => {

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
              onMouseDown={() => setPreviewPhoto(p)}
              onTouchStart={() => setPreviewPhoto(p)}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
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
  };


  return (

    <>

      {/* 今回の写真撮影エリア */}
      <div className="flex-1 p-2 overflow-y-auto bg-blue-50/10">

        <div className="text-center text-[10px] font-black text-blue-700 mb-2">
          今回の点検写真
        </div>

        {/* 写真枠1〜4 */}
        <div className="border border-black rounded p-2 mb-3">
          <div className="grid grid-cols-2 gap-3">
            {photos.slice(0,4).map((p, i) => renderPhoto(p, i))}
          </div>
        </div>

        {/* 写真枠5〜8 */}
        <div className="border border-black rounded p-2">
          <div className="grid grid-cols-2 gap-3">
            {photos.slice(4,8).map((p, i) => renderPhoto(p, i + 4))}
          </div>
        </div>

      </div>



    </>
  );
}