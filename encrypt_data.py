#!/usr/bin/env python3
"""Encrypt data/banks.json -> data/banks.enc.json (AES-256-GCM, PBKDF2-SHA256).

The browser decrypts this with WebCrypto using the passphrase you type into the
unlock screen. The passphrase is never stored or transmitted anywhere.

    python3 encrypt_data.py "your passphrase"
"""
import json, os, sys, base64, getpass
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

SRC = "data/banks.json"
OUT = "data/banks.enc.json"
ITER = 250_000

def main():
    pw = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass("Passphrase: ")
    if len(pw) < 8:
        sys.exit("Use at least 8 characters.")
    plaintext = open(SRC, "rb").read()

    salt = os.urandom(16)
    iv = os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                     salt=salt, iterations=ITER).derive(pw.encode())
    ct = AESGCM(key).encrypt(iv, plaintext, None)

    doc = {
        "format": "dsadesk-enc-v1",
        "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": ITER,
                "salt": base64.b64encode(salt).decode()},
        "cipher": {"name": "AES-GCM", "iv": base64.b64encode(iv).decode()},
        "data": base64.b64encode(ct).decode(),
    }
    json.dump(doc, open(OUT, "w"), indent=1)

    src_kb = len(plaintext) / 1024
    out_kb = os.path.getsize(OUT) / 1024
    banks = len(json.loads(plaintext)["banks"])
    print(f"encrypted {banks} banks  {src_kb:.0f} KB -> {out_kb:.0f} KB  {OUT}")
    print("Remember this passphrase — it cannot be recovered.")

if __name__ == "__main__":
    main()
