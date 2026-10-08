const types = new Set(["image/png", "image/jpeg", "image/webp"]);
const sourceLimit = 5 * 1024 * 1024;
const uploadLimit = 512 * 1024;

export async function prepareAvatar(file: File): Promise<string> {
  if (!types.has(file.type))
    throw new Error("PNG, JPG, WebP 이미지를 선택해 주세요.");
  if (file.size > sourceLimit)
    throw new Error("5MB 이하의 이미지를 선택해 주세요.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("이미지를 읽을 수 없어요. 다른 파일을 선택해 주세요.");
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side || image.naturalWidth * image.naturalHeight > 40_000_000)
      throw new Error("이미지 크기가 너무 커요. 작은 이미지를 선택해 주세요.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(side, 512);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서 이미지를 처리할 수 없어요.");
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const result = canvas.toDataURL("image/webp", 0.88);
    if ((result.split(",")[1]?.length || 0) * 0.75 > uploadLimit)
      throw new Error("이미지를 줄이지 못했어요. 작은 파일을 선택해 주세요.");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
