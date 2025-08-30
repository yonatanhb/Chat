export const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000";

const WS_BASE: string = API_BASE.replace(/^http/, "ws");

export function authHeader(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function machineAuth() {
  const res = await fetch(`${API_BASE}/machine/auth`);
  if (!res.ok) throw new Error("Machine not authorized");
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function getChats(token: string) {
  const res = await fetch(`${API_BASE}/chats/`, { headers: authHeader(token) });
  if (!res.ok) throw new Error("Failed to load chats");
  return res.json() as Promise<
    Array<{
      id: number;
      chat_type: string;
      participants: { id: number; username: string }[];
      title?: string;
      is_pinned: boolean;
    }>
  >;
}

// Legacy WS URL helpers removed after migrating to unified socket

export async function getMe(token: string) {
  const res = await fetch(`${API_BASE}/users/me/`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to load user");
  return res.json() as Promise<{ id: number; username: string; role: string }>;
}

export async function registerAccount(payload: {
  username: string;
  first_name?: string;
  last_name?: string;
  password: string;
  public_key_jwk: string;
  algorithm?: string;
}) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.detail ?? "Registration failed");
  }
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function loginWithKey(payload: {
  public_key_jwk: string;
  password: string;
}) {
  const res = await fetch(`${API_BASE}/auth/login-with-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.detail ?? "Login failed");
  }
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

// Admin APIs
export async function adminLogin(password: string) {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.detail ?? "Admin login failed");
  }
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function adminGetMachines(adminToken: string) {
  const res = await fetch(`${API_BASE}/admin/machines`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error("Failed to load machines");
  return res.json() as Promise<
    Array<{
      id: number;
      ip_address: string;
      user?: { id: number; username: string };
    }>
  >;
}

export async function isAdminMachine() {
  const res = await fetch(`${API_BASE}/admin/is-admin`);
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean((data as any).is_admin);
}

export async function adminAuthorize(
  ip: string,
  adminToken: string,
  username?: string
) {
  const url = new URL(`${API_BASE}/admin/machines/authorize`);
  url.searchParams.set("ip", ip);
  if (username) url.searchParams.set("username", username);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error("Failed to authorize machine");
  return res.json();
}

export async function adminRevoke(ip: string, adminToken: string) {
  const res = await fetch(
    `${API_BASE}/admin/machines/revoke?ip=${encodeURIComponent(ip)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );
  if (!res.ok) throw new Error("Failed to revoke machine");
  return res.json();
}

export async function adminLanHosts() {
  const res = await fetch(`${API_BASE}/admin/lan-hosts`);
  if (!res.ok) throw new Error("Failed to scan lan");
  const data = (await res.json()) as { hosts: { ip: string }[] };
  return data.hosts.map((h) => h.ip);
}

export async function adminSetApproved(
  ip: string,
  approved: boolean,
  adminToken: string
) {
  const url = new URL(`${API_BASE}/admin/machines/approve`);
  url.searchParams.set("ip", ip);
  url.searchParams.set("approved", String(approved));
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error("Failed to set approved flag");
  return res.json();
}

export async function getMachineInfo() {
  const res = await fetch(`${API_BASE}/machine/info`);
  if (!res.ok) throw new Error("Failed to fetch machine info");
  return res.json() as Promise<{
    ip: string;
    approved: boolean;
    is_admin: boolean;
  }>;
}

export async function adminAddMachine(
  ip: string,
  isAdmin: boolean,
  adminToken: string,
  username?: string
) {
  const url = new URL(`${API_BASE}/admin/machines/add`);
  url.searchParams.set("ip", ip);
  url.searchParams.set("is_admin", String(isAdmin));
  if (username) url.searchParams.set("username", username);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error("Failed to add machine");
  return res.json();
}

// Chat creation helpers
export async function getApprovedMachines(token: string) {
  const res = await fetch(`${API_BASE}/machines/approved`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to load approved machines");
  return res.json() as Promise<
    Array<{
      id: number;
      ip_address: string;
      approved: boolean;
      is_admin: boolean;
      user?: { id: number; username: string };
    }>
  >;
}

export async function getApprovedPeers(token: string) {
  const res = await fetch(`${API_BASE}/users/approved-peers`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to load approved peers");
  return res.json() as Promise<
    Array<{
      user_id: number;
      username: string;
      chat_id?: number | null;
      is_self: boolean;
    }>
  >;
}

export async function createPrivateChat(token: string, target_user_id: number) {
  const res = await fetch(`${API_BASE}/chats/private`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ target_user_id }),
  });
  if (!res.ok) throw new Error("Failed to create private chat");
  return res.json() as Promise<{ id: number }>;
}

export async function createGroupChat(
  token: string,
  member_ids: number[],
  name?: string
) {
  const res = await fetch(`${API_BASE}/chats/`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_type: "group",
      participant_ids: member_ids,
      name,
    }),
  });
  if (!res.ok) throw new Error("Failed to create group chat");
  return res.json() as Promise<{ id: number }>;
}

export async function addMembers(
  token: string,
  chatId: number,
  member_ids: number[]
) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/members`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ member_ids }),
  });
  if (!res.ok) throw new Error("Failed to add members");
  return res.json();
}

export async function removeMembers(
  token: string,
  chatId: number,
  member_ids: number[]
) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/members`, {
    method: "DELETE",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ member_ids }),
  });
  if (!res.ok) throw new Error("Failed to remove members");
  return res.json();
}

export async function renameGroup(token: string, chatId: number, name: string) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/name`, {
    method: "PUT",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.detail ?? "Failed to rename group");
  }
  return res.json() as Promise<{
    id: number;
    chat_type: string;
    name?: string | null;
    participants: { id: number; username: string }[];
    title?: string;
    admin_user_id?: number | null;
  }>;
}

export async function getChatMessages(token: string, chatId: number) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to load messages");
  return res.json() as Promise<
    Array<{
      id: number;
      content: string | null;
      content_type: string;
      timestamp: string;
      sender: { id: number; username: string };
      ciphertext?: string | null;
      nonce?: string | null;
      algo?: string | null;
      recipient_id?: number | null;
      attachment?: {
        id: number;
        filename: string;
        mime_type: string;
        size_bytes: number;
        nonce: string;
        algo: string;
      } | null;
    }>
  >;
}

export async function sendMessage(
  token: string,
  chatId: number,
  content: string,
  content_type: "text" | "image" = "text"
) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ content, content_type }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json() as Promise<{
    id: number;
    content: string;
    content_type: string;
    timestamp: string;
    sender: { id: number; username: string };
    attachment?: {
      id: number;
      filename: string;
      mime_type: string;
      size_bytes: number;
      nonce: string;
      algo: string;
    } | null;
  }>;
}

export async function getReadState(token: string, chatId: number) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/read-state`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to load read state");
  return res.json() as Promise<{
    chat_id: number;
    last_read_message_id: number | null;
  }>;
}

export async function setReadState(
  token: string,
  chatId: number,
  lastReadMessageId: number | null
) {
  const url = new URL(`${API_BASE}/chats/${chatId}/read-state`);
  if (lastReadMessageId != null)
    url.searchParams.set("last_read_message_id", String(lastReadMessageId));
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to set read state");
  return res.json() as Promise<{
    chat_id: number;
    last_read_message_id: number | null;
  }>;
}

export async function getUnreadCounts(token: string) {
  const res = await fetch(`${API_BASE}/chats/unread-counts`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to load unread counts");
  return res.json() as Promise<
    Array<{ chat_id: number; unread_count: number }>
  >;
}

export async function publishPublicKey(
  token: string,
  public_key_jwk: string,
  algorithm = "ECDH-P-256"
) {
  const res = await fetch(`${API_BASE}/crypto/public-key`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ public_key_jwk, algorithm }),
  });
  if (!res.ok) throw new Error("Failed to publish key");
  return res.json() as Promise<{
    user_id: number;
    public_key_jwk: string;
    algorithm: string;
  }>;
}

export async function getPublicKey(token: string, userId: number) {
  const res = await fetch(`${API_BASE}/crypto/public-key/${userId}`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to fetch key");
  return res.json() as Promise<{
    user_id: number;
    public_key_jwk: string;
    algorithm: string;
  }>;
}

export async function publishGroupKeyWrap(
  token: string,
  chatId: number,
  recipient_user_id: number,
  wrapped_key_ciphertext: string,
  wrapped_key_nonce: string,
  algo = "AES-GCM"
) {
  const res = await fetch(`${API_BASE}/crypto/group-key/wrap`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      recipient_user_id,
      wrapped_key_ciphertext,
      wrapped_key_nonce,
      algo,
    }),
  });
  if (!res.ok) throw new Error("Failed to publish group key wrap");
  return res.json() as Promise<{
    chat_id: number;
    provider_user_id: number;
    recipient_user_id: number;
    wrapped_key_ciphertext: string;
    wrapped_key_nonce: string;
    algo: string;
  }>;
}

export async function getGroupKeyWrap(token: string, chatId: number) {
  const res = await fetch(`${API_BASE}/crypto/group-key/wrap/${chatId}`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to fetch group key wrap");
  return res.json() as Promise<{
    chat_id: number;
    provider_user_id: number;
    recipient_user_id: number;
    wrapped_key_ciphertext: string;
    wrapped_key_nonce: string;
    algo: string;
  }>;
}

export async function uploadEncryptedFile(
  token: string,
  ciphertext: Uint8Array,
  filename: string,
  mime: string,
  nonceB64: string
) {
  const form = new FormData();
  form.append("file", new Blob([ciphertext], { type: mime }), filename);
  const res = await fetch(`${API_BASE}/files/upload`, {
    method: "POST",
    headers: { ...authHeader(token), "x-nonce": nonceB64 },
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<{
    id: number;
    filename: string;
    mime_type: string;
    size_bytes: number;
    nonce: string;
    algo: string;
  }>;
}

export async function downloadAttachment(token: string, id: number) {
  const res = await fetch(`${API_BASE}/files/${id}`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Download failed");
  const nonce = res.headers.get("x-nonce") || "";
  const algo = res.headers.get("x-algo") || "AES-GCM";
  const disp = res.headers.get("Content-Disposition") || "";
  const mime = res.headers.get("Content-Type") || "application/octet-stream";
  const blob = await res.blob();
  // try to parse filename from disposition
  let filename = `file-${id}`;
  try {
    const m = disp.match(/filename\*=UTF-8''([^;]+)/);
    if (m && m[1]) filename = decodeURIComponent(m[1]);
  } catch {}
  return { blob, nonce, algo, mime, filename };
}

export async function sendMessageWithAttachment(
  token: string,
  chatId: number,
  attachment_id: number,
  content_type: "image" | "video" | "file",
  ciphertext?: string,
  nonce?: string,
  algo?: string
) {
  const body: any = { content: null, content_type, attachment_id };
  if (ciphertext && nonce) {
    body.ciphertext = ciphertext;
    body.nonce = nonce;
    body.algo = algo || "AES-GCM";
  }
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json() as Promise<{
    id: number;
    content_type: string;
    timestamp: string;
    attachment?: {
      id: number;
      filename: string;
      mime_type: string;
      size_bytes: number;
      nonce: string;
      algo: string;
    } | null;
  }>;
}

// Pinned Chats API - now integrated into /chats endpoint
// Pin/Unpin operations still use dedicated endpoints
export async function pinChat(token: string, chatId: number) {
  const res = await fetch(`${API_BASE}/user-settings/pin-chat`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.detail ?? "Failed to pin chat");
  }
  return res.json() as Promise<{ message: string }>;
}

export async function unpinChat(token: string, chatId: number) {
  const res = await fetch(`${API_BASE}/user-settings/unpin-chat`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.detail ?? "Failed to unpin chat");
  }
  return res.json() as Promise<{ message: string }>;
}

// User Settings API
export async function getUserSettings(token: string) {
  const res = await fetch(`${API_BASE}/user-settings/`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error("Failed to load user settings");
  return res.json() as Promise<{
    id: number;
    user_id: number;
    pinned_chats_limit: number;
    created_at: string;
    updated_at: string | null;
  }>;
}

export async function updateUserSettings(
  token: string,
  settings: { pinned_chats_limit?: number }
) {
  const res = await fetch(`${API_BASE}/user-settings/`, {
    method: "PUT",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.detail ?? "Failed to update user settings");
  }
  return res.json() as Promise<{
    id: number;
    user_id: number;
    pinned_chats_limit: number;
    created_at: string;
    updated_at: string | null;
  }>;
}
