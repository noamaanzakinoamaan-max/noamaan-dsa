/* crypto.js — unlock the encrypted bank master in the browser (WebCrypto) */

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function decryptBundle(doc, passphrase) {
  if (doc.format !== "dsadesk-enc-v1") throw new Error("Unrecognised data file.");
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(doc.kdf.salt),
      iterations: doc.kdf.iterations, hash: doc.kdf.hash },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64(doc.cipher.iv) }, key, b64(doc.data)
    );
  } catch {
    throw new Error("Wrong passphrase.");
  }
  return JSON.parse(new TextDecoder().decode(plain));
}

/* Remember the passphrase for this browser session only (tab close = forgotten). */
const SKEY = "dsadesk.pass";
export const remember = (p) => { try { sessionStorage.setItem(SKEY, p); } catch {} };
export const recall = () => { try { return sessionStorage.getItem(SKEY); } catch { return null; } };
export const forget = () => { try { sessionStorage.removeItem(SKEY); } catch {} };
