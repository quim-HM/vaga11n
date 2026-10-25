// QR code as a PNG data URL (qrcode-generator, MIT, vendored). Same look as tools/make_qr.py:
// error correction M, 16 px modules, 2-module white border.
import qrcode from "../vendor/qrcode/qrcode.mjs";

export function qrDataURL(text, scale = 16, border = 2) {
  const q = qrcode(0, "M");
  // byte mode with UTF-8 bytes (the library maps each char code to one byte)
  q.addData(Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join(""), "Byte");
  q.make();
  const n = q.getModuleCount();
  const size = (n + border * 2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, size, size);
  g.fillStyle = "#000000";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (q.isDark(y, x)) g.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
  }
  return canvas.toDataURL("image/png");
}
