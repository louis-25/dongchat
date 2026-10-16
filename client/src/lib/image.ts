// 업로드 전 JPEG로 줄이기(브라우저 전용). square면 가운데를 잘라 maxSide 정사각형, 아니면 긴 변을 maxSide 이하로(확대 안 함).
export async function toJpeg(file: Blob, opts: { maxSide: number; square?: boolean; quality?: number }): Promise<Blob> {
  const img = await createImageBitmap(file); // EXIF 회전 반영
  const side = Math.min(img.width, img.height);
  const [sx, sy, sw, sh] = opts.square
    ? [(img.width - side) / 2, (img.height - side) / 2, side, side]
    : [0, 0, img.width, img.height];
  const scale = Math.min(1, opts.maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 변환하지 못했어요."))), "image/jpeg", opts.quality ?? 0.85),
  );
}
