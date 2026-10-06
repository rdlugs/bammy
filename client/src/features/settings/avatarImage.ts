const SIZE = 256
const MAX_INPUT_BYTES = 10 * 1024 * 1024

// Crops the picked image to its centered square and scales it to 256px, so the
// server only ever stores a small JPEG whatever the user picked.
export async function toAvatarJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file")
  if (file.size > MAX_INPUT_BYTES) throw new Error("Choose an image smaller than 10 MB")

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image could not be read")
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Your browser cannot process images")
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
  if (!blob) throw new Error("That image could not be processed")
  return blob
}
