import { useCallback, useRef } from "react";
import { getGroupKeyWrap, getPublicKey, publishGroupKeyWrap } from "@/api";
import {
  decryptBytesAesGcm,
  exportGroupKeyRaw,
  generateGroupKey,
  getSharedKeyWithUser,
  importGroupKeyRaw,
  loadGroupKey,
  saveGroupKey,
} from "@/lib/e2ee";

export function useGroupKey(token: string | null) {
  const groupKeyRef = useRef<CryptoKey | null>(null);

  const ensureGroupKey = useCallback(
    async (
      chat: {
        id: number;
        chat_type: string;
        participants: { id: number; username: string }[];
        admin_user_id?: number | null;
      },
      myUserId: number | null
    ): Promise<CryptoKey | null> => {
      if (!token) return null;
      if (chat.chat_type !== "group") {
        groupKeyRef.current = null;
        return null;
      }
      const loaded = await loadGroupKey(chat.id);
      if (loaded) {
        groupKeyRef.current = loaded;
        return loaded;
      }
      try {
        const wrap = await getGroupKeyWrap(token, chat.id);
        const providerKey = await getPublicKey(token, wrap.provider_user_id);
        const shared = await getSharedKeyWithUser(
          wrap.provider_user_id,
          JSON.parse(providerKey.public_key_jwk)
        );
        const raw = await decryptBytesAesGcm(
          wrap.wrapped_key_ciphertext,
          wrap.wrapped_key_nonce,
          shared
        );
        const key = await importGroupKeyRaw(raw);
        await saveGroupKey(chat.id, key);
        groupKeyRef.current = key;
        return key;
      } catch {}
      for (let i = 0; i < 2; i++) {
        try {
          await new Promise((r) => setTimeout(r, 1200));
          const wrap = await getGroupKeyWrap(token, chat.id);
          const providerKey = await getPublicKey(token, wrap.provider_user_id);
          const shared = await getSharedKeyWithUser(
            wrap.provider_user_id,
            JSON.parse(providerKey.public_key_jwk)
          );
          const raw = await decryptBytesAesGcm(
            wrap.wrapped_key_ciphertext,
            wrap.wrapped_key_nonce,
            shared
          );
          const key = await importGroupKeyRaw(raw);
          await saveGroupKey(chat.id, key);
          groupKeyRef.current = key;
          return key;
        } catch {}
      }
      if (chat.admin_user_id && myUserId && chat.admin_user_id === myUserId) {
        const key = await generateGroupKey();
        await saveGroupKey(chat.id, key);
        groupKeyRef.current = key;
        const raw = await exportGroupKeyRaw(key);
        for (const p of chat.participants) {
          if (p.id === myUserId) continue;
          try {
            const pk = await getPublicKey(token, p.id);
            const shared = await getSharedKeyWithUser(
              p.id,
              JSON.parse(pk.public_key_jwk)
            );
            const wrapped = await encryptAndWrap(raw, shared);
            await publishGroupKeyWrap(
              token,
              chat.id,
              p.id,
              wrapped.ciphertextB64,
              wrapped.nonceB64,
              wrapped.algo
            );
          } catch {}
        }
        return key;
      }
      return null;
    },
    [token]
  );

  return { ensureGroupKey, groupKeyRef };
}

async function encryptAndWrap(
  raw: Uint8Array,
  sharedKey: CryptoKey
): Promise<{ ciphertextB64: string; nonceB64: string; algo: string }> {
  const { encryptBytesAesGcm } = await import("@/lib/e2ee");
  const wrapped = await encryptBytesAesGcm(raw, sharedKey);
  return wrapped;
}


