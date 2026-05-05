/** Read file bytes in environments where Blob#arrayBuffer may be missing or flaky. */
export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    try {
      const ab = await file.arrayBuffer();
      return new Uint8Array(ab);
    } catch {
      /* fall through */
    }
  }

  const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error("File read failed"));
    fr.readAsArrayBuffer(file);
  });
  return new Uint8Array(ab);
}
