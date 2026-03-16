export const resizeImage = async (base64Str: string): Promise<string> => {

  return new Promise((resolve) => {

    const img = new Image();
    img.src = base64Str;

    img.onload = () => {

      const MAX_SIZE = 800;

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

      let quality = 0.7;
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