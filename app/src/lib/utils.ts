import { customAlphabet } from "nanoid";
import { twMerge } from "tailwind-merge";
import { clsx, type ClassValue } from "clsx";
import { ed25519 } from "@noble/curves/ed25519";
import { ED25519_SIGNATURE_LENGTH } from "@/lib/constants";

export const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 5);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const verifyEd25519Signature = (signature: string, hash: string): boolean => {
  if (signature === "" || hash === "") {
    return false;
  }
  
  const bytes = Uint8Array.from(Buffer.from(signature, "base64"));
  const signatureBytes = bytes.slice(1, ED25519_SIGNATURE_LENGTH + 1);
  const publicKeyBytes = bytes.slice(ED25519_SIGNATURE_LENGTH + 1);
  const responseHashBytes = Uint8Array.from(Buffer.from(hash, "base64"));
  return ed25519.verify(signatureBytes, responseHashBytes, publicKeyBytes);
}
