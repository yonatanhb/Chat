import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { downloadAttachment, getPublicKey, getGroupKeyWrap } from "@/api";
import {
  getSharedKeyWithUser,
  loadGroupKey,
  importGroupKeyRaw,
  saveGroupKey,
  decryptBytesAesGcm,
} from "@/lib/e2ee";

type Attachment = {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  nonce: string;
  algo: string;
};
type Message = {
  id: number;
  content: string | null;
  content_type?: string;
  sender?: { id: number; username: string };
  timestamp?: string;
  attachment?: Attachment | null;
};

type Props = {
  messages: Message[];
  firstUnreadIndex: number;
  myId?: number | null;
  isGroup?: boolean;
  token?: string;
  chatId?: number | null;
  otherUserId?: number | null;
};

export function ChatMessages({
  messages,
  firstUnreadIndex,
  myId,
  isGroup,
  token,
  chatId,
  otherUserId,
}: Props) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [objectUrlCache, setObjectUrlCache] = useState<Record<number, string>>(
    {}
  );
  const formatTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return null;
    }
  }, []);
  const weekdayFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("he-IL", { weekday: "long" });
    } catch {
      return null;
    }
  }, []);
  const dateFmt = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    return () => {
      // cleanup object URLs
      for (const id of Object.keys(objectUrlCache)) {
        try {
          URL.revokeObjectURL(objectUrlCache[Number(id)]);
        } catch {}
      }
    };
  }, []);

  function parseCode(content: string | null): {
    isCode: boolean;
    language?: string;
    code?: string;
  } {
    if (!content) return { isCode: false };
    const match = content.match(
      /^```\s*([a-zA-Z0-9+#_-]+)?\s*\n([\s\S]*?)\n```\s*$/
    );
    if (match) {
      const language = match[1]?.trim() || undefined;
      const code = match[2] ?? "";
      return { isCode: true, language, code };
    }
    return { isCode: false };
  }

  async function ensureDecryptedUrl(
    att: Attachment,
    peerHintUserId?: number
  ): Promise<string> {
    const cached = objectUrlCache[att.id];
    if (cached) return cached;
    if (!token || !chatId) throw new Error("Missing token or chatId");
    console.debug("[attach] start download", {
      id: att.id,
      name: att.filename,
      mime: att.mime_type,
      isGroup,
      chatId,
      otherUserId,
      peerHintUserId,
    });
    const res = await downloadAttachment(token, att.id);
    // Build candidate keys (try group key and/or private shared key)
    const candidateKeys: CryptoKey[] = [];
    const candidateLabels: string[] = [];
    async function tryLoadGroup(): Promise<CryptoKey | undefined> {
      try {
        const existing = (await loadGroupKey(chatId!)) as any;
        if (existing) {
          console.debug("[attach] group key loaded from storage");
          return existing;
        }
        if (isGroup && token && chatId) {
          try {
            console.debug("[attach] fetching group key wrap");
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
            console.debug("[attach] group key imported and saved");
            return key;
          } catch {
            console.warn("[attach] failed to fetch/import group key wrap");
            return undefined;
          }
        }
        return undefined;
      } catch {
        console.warn("[attach] error while loading group key");
        return undefined;
      }
    }
    async function tryDerivePrivate(
      forUserId: number | null | undefined
    ): Promise<CryptoKey | undefined> {
      if (!forUserId) return undefined;
      try {
        console.debug(
          "[attach] deriving private shared key with user",
          forUserId
        );
        const keyRec = await getPublicKey(token!, forUserId);
        return await getSharedKeyWithUser(
          forUserId,
          JSON.parse(keyRec.public_key_jwk)
        );
      } catch {
        console.warn(
          "[attach] failed deriving shared key with user",
          forUserId
        );
        return undefined;
      }
    }
    if (isGroup) {
      const g = await tryLoadGroup();
      if (g) {
        candidateKeys.push(g);
        candidateLabels.push("group");
      }
      // In groups, also try a private shared key hint if available (robustness)
      const ph = await tryDerivePrivate(peerHintUserId);
      if (ph) {
        candidateKeys.push(ph);
        candidateLabels.push(`private:user:${peerHintUserId}`);
      }
    } else {
      // Try with the other participant first
      const p1 = await tryDerivePrivate(otherUserId);
      if (p1) {
        candidateKeys.push(p1);
        candidateLabels.push(`private:user:${otherUserId}`);
      }
      // Also try with the sender hint (covers edge cases when otherUserId is unresolved yet)
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
    // Decrypt using raw bytes; normalize nonce base64 (handles url-safe and padding)
    const ct = new Uint8Array(await res.blob.arrayBuffer());
    console.debug("[attach] response meta", {
      mime: res.mime,
      nonceHeaderLen: (res.nonce || "").length,
      size: ct.length,
    });
    const normalizeB64 = (b64: string) => {
      let s = b64.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      return s;
    };
    // Prefer nonce from message attachment if present; fallback to response header
    const useAttNonce = !!(att.nonce && att.nonce.length);
    const nonceB64 = (useAttNonce ? att.nonce : res.nonce) || "";
    console.debug("[attach] nonce source", {
      source: useAttNonce ? "attachment" : "header",
      len: nonceB64.length,
    });
    const nonceBin = atob(normalizeB64(nonceB64));
    const nonce = new Uint8Array(nonceBin.length);
    for (let i = 0; i < nonceBin.length; i++) nonce[i] = nonceBin.charCodeAt(i);
    let ptBuf: ArrayBuffer | null = null;
    let lastErr: any;
    console.debug("[attach] trying keys", candidateLabels);
    for (let i = 0; i < candidateKeys.length; i++) {
      const k = candidateKeys[i];
      const label = candidateLabels[i];
      try {
        console.debug("[attach] decrypt try with", label);
        ptBuf = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: nonce },
          k,
          ct
        );
        console.debug("[attach] decrypt success with", label);
        break;
      } catch (e) {
        console.warn("[attach] decrypt failed with", label, e);
        lastErr = e;
      }
    }
    if (!ptBuf) throw lastErr || new Error("Decrypt failed");
    const plain = new Blob([ptBuf], { type: att.mime_type || res.mime });
    console.debug("[attach] creating object url", { outMime: plain.type });
    const url = URL.createObjectURL(plain);
    setObjectUrlCache((prev) => ({ ...prev, [att.id]: url }));
    return url;
  }

  return (
    <div className="w-full max-w-full flex-1 overflow-y-auto space-y-2 pr-2 pl-2 box-border">
      {(() => {
        // Helpers for day grouping
        const startOfDay = (d: Date) => {
          const x = new Date(d);
          x.setHours(0, 0, 0, 0);
          return x;
        };
        const isSameDay = (a: Date, b: Date) =>
          a.getFullYear() === b.getFullYear() &&
          a.getMonth() === b.getMonth() &&
          a.getDate() === b.getDate();
        const labelFor = (date: Date): string => {
          const today = startOfDay(new Date());
          const d0 = startOfDay(date);
          const yesterday = new Date(today);
          yesterday.setDate(today.getDate() - 1);
          if (isSameDay(d0, today)) return "היום";
          if (isSameDay(d0, yesterday)) return "אתמול";
          const sevenAgo = new Date(today);
          sevenAgo.setDate(today.getDate() - 7);
          const weekday = weekdayFmt
            ? weekdayFmt.format(date)
            : date.toLocaleDateString("he-IL", { weekday: "long" } as any);
          if (d0 > sevenAgo) return weekday;
          const full = dateFmt
            ? dateFmt.format(date)
            : date.toLocaleDateString("he-IL");
          return `${weekday}, ${full}`;
        };
        let lastDayKey: string | null = null;
        return messages.map((m, idx) => {
          const isMine = myId != null && m.sender?.id === myId;
          const parsed = parseCode(m.content ?? null);
          const ts = m.timestamp ? new Date(m.timestamp) : null;
          const dayKey = ts
            ? `${ts.getFullYear()}-${ts.getMonth() + 1}-${ts.getDate()}`
            : `idx-${idx}`;
          const showDateLabel = ts != null && dayKey !== lastDayKey;
          if (showDateLabel) lastDayKey = dayKey;
          return (
            <Fragment key={m.id}>
              {showDateLabel && ts && (
                <div className="text-center text-xs text-muted-foreground my-3">
                  — {labelFor(ts)} —
                </div>
              )}
              {firstUnreadIndex === idx && (
                <div className="text-center text-xs text-muted-foreground my-2">
                  — הודעות שלא נקראו —
                </div>
              )}
              <div
                className={`w-full flex ${
                  isMine ? "justify-start" : "justify-end"
                }`}
              >
                {parsed.isCode ? (
                  <div
                    className={`inline-block rounded-2xl max-w-[85%] overflow-hidden ${
                      isMine ? "rounded-br-none" : "rounded-bl-none"
                    }`}
                  >
                    {isGroup && !isMine && m.sender?.username && (
                      <div className="text-[11px] text-gray-500 px-3 pt-2">
                        {m.sender.username}
                      </div>
                    )}
                    <div className="bg-gray-800 text-gray-100 text-xs px-3 py-1 font-mono flex items-center justify-between">
                      <span>
                        קוד{parsed.language ? ` · ${parsed.language}` : ""}
                      </span>
                      <button
                        className="text-gray-300 hover:text-white"
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(parsed.code || "");
                          } catch {}
                        }}
                      >
                        העתק
                      </button>
                    </div>
                    <pre
                      dir="ltr"
                      className="bg-gray-900 text-gray-100 text-sm p-3 overflow-x-auto font-mono whitespace-pre"
                    >
                      <code>{parsed.code}</code>
                    </pre>
                  </div>
                ) : (
                  <div
                    className={`inline-block px-3 py-2 rounded-2xl max-w-[75%] break-words break-all ${
                      isMine
                        ? "bg-gray-100 text-gray-900 rounded-br-none"
                        : "bg-blue-600 text-white rounded-bl-none"
                    }`}
                  >
                    {isGroup && !isMine && m.sender?.username && (
                      <div
                        className={`${
                          isMine ? "text-gray-500" : "text-white/80"
                        } text-[11px] mb-1`}
                      >
                        {m.sender.username}
                      </div>
                    )}
                    {m.attachment ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs truncate max-w-[220px]"
                          title={m.attachment.filename}
                        >
                          {m.attachment.filename}
                        </span>
                        <button
                          aria-label="הורדה"
                          className={`${
                            isMine
                              ? "text-gray-700 hover:text-gray-900"
                              : "text-white/90 hover:text-white"
                          } p-1 rounded`}
                          onClick={async () => {
                            try {
                              const url = await ensureDecryptedUrl(
                                m.attachment!,
                                m.sender?.id
                              );
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = m.attachment!.filename;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                            } catch (e) {
                              console.error(e);
                              alert(
                                "נכשלה הורדת הקובץ. ודא שמפתח ההצפנה זמין."
                              );
                            }
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-4 h-4"
                          >
                            <path d="M12 3a1 1 0 0 1 1 1v8.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4.001 4a1 1 0 0 1-1.412 0l-4.001-4a1 1 0 0 1 1.414-1.414L11 12.586V4a1 1 0 0 1 1-1z" />
                            <path d="M5 20a1 1 0 1 1 0-2h14a1 1 0 1 1 0 2H5z" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div>{m.content ?? ""}</div>
                    )}
                    {m.timestamp && (
                      <div
                        className={`${
                          isMine ? "text-gray-500" : "text-white/80"
                        } text-[10px] mt-1 text-left`}
                        dir="ltr"
                      >
                        {formatTime
                          ? formatTime.format(new Date(m.timestamp))
                          : new Date(m.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          );
        });
      })()}
      <div ref={anchorRef} />
    </div>
  );
}
