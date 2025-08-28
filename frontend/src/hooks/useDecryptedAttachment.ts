import { useCallback, useEffect, useRef, useState } from "react";
import { downloadAttachment, getGroupKeyWrap, getPublicKey } from "@/api";
import {
  decryptBytesAesGcm,
  getSharedKeyWithUser,
  importGroupKeyRaw,
  loadGroupKey,
  saveGroupKey,
} from "@/lib/e2ee";
import type { Attachment } from "@/types/chat";

type Options = {
  token?: string;
  chatId?: number | null;
  isGroup?: boolean;
  otherUserId?: number | null;
};

export function useDecryptedAttachment({ token, chatId, isGroup, otherUserId }: Options) {
  const [cache, setCache] = useState<Record<number, string>>({});
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  useEffect(() => {
    return () => {
      for (const idStr of Object.keys(cacheRef.current)) {
        try {
          URL.revokeObjectURL(cacheRef.current[Number(idStr)]);
        } catch {}
      }
    };
  }, []);

  const ensureDecryptedUrl = useCallback(
    async (att: Attachment, peerHintUserId?: number): Promise<string> => {
      const existing = cacheRef.current[att.id];
      if (existing) return existing;
      if (!token || !chatId) throw new Error("Missing token or chatId");

      const res = await downloadAttachment(token, att.id);

      const candidateKeys: CryptoKey[] = [];
      const candidateLabels: string[] = [];

      async function tryLoadGroup(): Promise<CryptoKey | undefined> {
        try {
          const existing = (await loadGroupKey(chatId!)) as any;
          if (existing) return existing;
          if (isGroup && token && chatId) {
            try {
              const wrap = await getGroupKeyWrap(token, chatId);
              const provider = await getPublicKey(token, wrap.provider_user_id);
              const shared = await getSharedKeyWithUser(
                wrap.provider_user_id,
                JSON.parse(provider.public_key_jwk)
              );
              const raw = await decryptBytesAesGcm(
                wrap.wrapped_key_ciphertext,
                wrap.wrapped_key_nonce,
                shared
              );
              const key = await importGroupKeyRaw(raw);
              await saveGroupKey(chatId, key);
              return key;
            } catch {
              return undefined;
            }
          }
          return undefined;
        } catch {
          return undefined;
        }
      }

      async function tryDerivePrivate(
        forUserId: number | null | undefined
      ): Promise<CryptoKey | undefined> {
        if (!forUserId) return undefined;
        try {
          const keyRec = await getPublicKey(token!, forUserId);
          return await getSharedKeyWithUser(
            forUserId,
            JSON.parse(keyRec.public_key_jwk)
          );
        } catch {
          return undefined;
        }
      }

      if (isGroup) {
        const g = await tryLoadGroup();
        if (g) {
          candidateKeys.push(g);
          candidateLabels.push("group");
        }
        const ph = await tryDerivePrivate(peerHintUserId);
        if (ph) {
          candidateKeys.push(ph);
          candidateLabels.push(`private:user:${peerHintUserId}`);
        }
      } else {
        const p1 = await tryDerivePrivate(otherUserId);
        if (p1) {
          candidateKeys.push(p1);
          candidateLabels.push(`private:user:${otherUserId}`);
        }
        const p2 = await tryDerivePrivate(peerHintUserId);
        if (p2) {
          candidateKeys.push(p2);
          candidateLabels.push(`private:user:${peerHintUserId}`);
        }
        const g = await tryLoadGroup();
        if (g) {
          candidateKeys.push(g);
          candidateLabels.push("group");
        }
      }

      if (!candidateKeys.length) throw new Error("Missing decryption key");

      const ct = new Uint8Array(await res.blob.arrayBuffer());
      const normalizeB64 = (b64: string) => {
        let s = b64.replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) s += "=";
        return s;
      };
      const useAttNonce = !!(att.nonce && att.nonce.length);
      const nonceB64 = (useAttNonce ? att.nonce : res.nonce) || "";
      const nonceBin = atob(normalizeB64(nonceB64));
      const nonce = new Uint8Array(nonceBin.length);
      for (let i = 0; i < nonceBin.length; i++) nonce[i] = nonceBin.charCodeAt(i);

      let ptBuf: ArrayBuffer | null = null;
      let lastErr: any;
      for (let i = 0; i < candidateKeys.length; i++) {
        try {
          ptBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonce },
            candidateKeys[i],
            ct
          );
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!ptBuf) throw lastErr || new Error("Decrypt failed");

      const plain = new Blob([ptBuf], { type: att.mime_type || res.mime });
      const url = URL.createObjectURL(plain);
      setCache((prev) => ({ ...prev, [att.id]: url }));
      return url;
    },
    [token, chatId, isGroup, otherUserId]
  );

  const revokeUrl = useCallback((attId: number) => {
    const url = cacheRef.current[attId];
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {}
    setCache((prev) => {
      const next = { ...prev };
      delete next[attId];
      return next;
    });
  }, []);

  return { ensureDecryptedUrl, revokeUrl };
}


