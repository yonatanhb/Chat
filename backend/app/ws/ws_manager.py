from typing import List, Dict, Set
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # We'll store connections per chat room
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Map websocket to user id for per-room permission enforcement
        self._ws_to_user_id: Dict[WebSocket, int] = {}
        # Presence subscribers (global)
        self.presence_sockets: List[WebSocket] = []
        # Online counts per user id
        self.user_online_counts: Dict[int, int] = {}
        # Per-user notification sockets (global WS for notifications)
        self.user_notify_sockets: Dict[int, List[WebSocket]] = {}
        # Unified WS: per-user sockets (single socket per tab typically)
        self.user_sockets: Dict[int, List[WebSocket]] = {}
        # Unified WS: room membership maps
        self.room_sockets: Dict[str, List[WebSocket]] = {}
        self.socket_rooms: Dict[WebSocket, Set[str]] = {}

    async def connect(self, websocket: WebSocket, chat_id: str, user_id: int):
        await websocket.accept()
        if chat_id not in self.active_connections:
            self.active_connections[chat_id] = []
        self.active_connections[chat_id].append(websocket)
        self._ws_to_user_id[websocket] = user_id
        try:
            logger.info(f"WS connect room={chat_id} total_room_conns={len(self.active_connections[chat_id])}")
        except Exception:
            pass

    def disconnect(self, websocket: WebSocket, chat_id: str):
        if chat_id in self.active_connections:
            self.active_connections[chat_id].remove(websocket)
            # If the room is empty, remove it from the dictionary
            if not self.active_connections[chat_id]:
                del self.active_connections[chat_id]
        # remove mapping if present
        try:
            self._ws_to_user_id.pop(websocket, None)
        except Exception:
            pass
        try:
            logger.info(f"WS disconnect room={chat_id}")
        except Exception:
            pass

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str, chat_id: str):
        if chat_id in self.active_connections:
            # iterate over a copy to allow safe removal
            conns = list(self.active_connections[chat_id])
            for connection in conns:
                try:
                    await connection.send_text(message)
                except Exception:
                    # drop broken socket and continue
                    try:
                        self.active_connections[chat_id].remove(connection)
                    except ValueError:
                        pass
            try:
                logger.info(f"Broadcast room={chat_id} sent_to={len(conns)}")
            except Exception:
                pass

    async def broadcast_all(self, message: str):
        # Send to all active chat connections across all rooms
        for room_id, conns in list(self.active_connections.items()):
            for connection in list(conns):
                try:
                    await connection.send_text(message)
                except Exception:
                    # Best-effort: ignore send errors here
                    pass
        try:
            total = sum(len(v) for v in self.active_connections.values())
            logger.info(f"BroadcastAll rooms={len(self.active_connections)} total_conns={total}")
        except Exception:
            pass

    async def unified_broadcast_all(self, message: str):
        # Send to all unified per-user sockets
        total = 0
        for uid, sockets in list(self.user_sockets.items()):
            for ws in list(sockets):
                try:
                    await ws.send_text(message)
                    total += 1
                except Exception:
                    try:
                        sockets.remove(ws)
                    except Exception:
                        pass
        try:
            logger.info(f"UnifiedBroadcastAll users={len(self.user_sockets)} total_conns={total}")
        except Exception:
            pass

    # ==== Unified WS helpers (rooms over a single socket) ====
    def register_user_socket(self, user_id: int, websocket: WebSocket):
        if user_id not in self.user_sockets:
            self.user_sockets[user_id] = []
        self.user_sockets[user_id].append(websocket)
        self._ws_to_user_id[websocket] = user_id
        if websocket not in self.socket_rooms:
            self.socket_rooms[websocket] = set()
        try:
            logger.info(f"UnifiedWS connect user_id={user_id} sockets={len(self.user_sockets[user_id])}")
        except Exception:
            pass

    def unregister_user_socket(self, user_id: int, websocket: WebSocket):
        # Remove from user sockets
        try:
            if user_id in self.user_sockets and websocket in self.user_sockets[user_id]:
                self.user_sockets[user_id].remove(websocket)
                if not self.user_sockets[user_id]:
                    del self.user_sockets[user_id]
        except Exception:
            pass
        # Remove from any rooms
        rooms = self.socket_rooms.get(websocket, set()).copy()
        for room_id in rooms:
            try:
                if room_id in self.room_sockets and websocket in self.room_sockets[room_id]:
                    self.room_sockets[room_id].remove(websocket)
                    if not self.room_sockets[room_id]:
                        del self.room_sockets[room_id]
            except Exception:
                pass
        try:
            self.socket_rooms.pop(websocket, None)
            self._ws_to_user_id.pop(websocket, None)
        except Exception:
            pass
        try:
            logger.info(f"UnifiedWS disconnect user_id={user_id}")
        except Exception:
            pass

    def subscribe_room(self, websocket: WebSocket, user_id: int, room_id: str):
        if room_id not in self.room_sockets:
            self.room_sockets[room_id] = []
        if websocket not in self.room_sockets[room_id]:
            self.room_sockets[room_id].append(websocket)
        if websocket not in self.socket_rooms:
            self.socket_rooms[websocket] = set()
        self.socket_rooms[websocket].add(room_id)
        self._ws_to_user_id[websocket] = user_id
        try:
            logger.info(f"UnifiedWS subscribe user_id={user_id} room={room_id} subs={len(self.room_sockets[room_id])}")
        except Exception:
            pass

    def unsubscribe_room(self, websocket: WebSocket, room_id: str):
        try:
            if room_id in self.room_sockets and websocket in self.room_sockets[room_id]:
                self.room_sockets[room_id].remove(websocket)
                if not self.room_sockets[room_id]:
                    del self.room_sockets[room_id]
        except Exception:
            pass
        try:
            if websocket in self.socket_rooms:
                self.socket_rooms[websocket].discard(room_id)
        except Exception:
            pass

    async def broadcast_room(self, room_id: str, message: str):
        if room_id not in self.room_sockets:
            return
        for ws in list(self.room_sockets[room_id]):
            try:
                await ws.send_text(message)
            except Exception:
                # Drop broken
                try:
                    self.room_sockets[room_id].remove(ws)
                except Exception:
                    pass


    def disconnect_user_from_room(self, chat_id: str, user_id: int):
        if chat_id not in self.active_connections:
            return
        remaining: List[WebSocket] = []
        for ws in list(self.active_connections[chat_id]):
            uid = self._ws_to_user_id.get(ws)
            if uid == user_id:
                try:
                    # best-effort close
                    import anyio
                    try:
                        anyio.from_thread.run(ws.close)
                    except Exception:
                        pass
                except Exception:
                    pass
                try:
                    self._ws_to_user_id.pop(ws, None)
                except Exception:
                    pass
            else:
                remaining.append(ws)
        self.active_connections[chat_id] = remaining

    async def connect_presence(self, websocket: WebSocket):
        await websocket.accept()
        self.presence_sockets.append(websocket)

    def disconnect_presence(self, websocket: WebSocket):
        if websocket in self.presence_sockets:
            self.presence_sockets.remove(websocket)

    async def _broadcast_presence(self, user_id: int, online: bool):
        # Prefer sending proper JSON from caller; this is a fallback
        payload = f'{ {"type": "presence", "user_id": user_id, "online": online} }'
        for ws in list(self.presence_sockets):
            try:
                await ws.send_text(payload)
            except Exception:
                # Drop broken sockets
                try:
                    self.presence_sockets.remove(ws)
                except ValueError:
                    pass

    async def connect_notify(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.user_notify_sockets:
            self.user_notify_sockets[user_id] = []
        self.user_notify_sockets[user_id].append(websocket)
        try:
            logger.info(f"Notify connect user_id={user_id} total_user_sockets={len(self.user_notify_sockets[user_id])}")
        except Exception:
            pass

    def disconnect_notify(self, user_id: int, websocket: WebSocket):
        if user_id in self.user_notify_sockets:
            try:
                self.user_notify_sockets[user_id].remove(websocket)
                if not self.user_notify_sockets[user_id]:
                    del self.user_notify_sockets[user_id]
            except ValueError:
                pass
        try:
            logger.info(f"Notify disconnect user_id={user_id}")
        except Exception:
            pass

    async def notify_user(self, user_id: int, message: str):
        if user_id in self.user_notify_sockets:
            sockets = list(self.user_notify_sockets[user_id])
            ok = 0
            for ws in sockets:
                try:
                    await ws.send_text(message)
                    ok += 1
                except Exception:
                    # drop broken
                    self.disconnect_notify(user_id, ws)
            try:
                logger.info(f"NotifyUser user_id={user_id} sent={ok} total={len(sockets)}")
            except Exception:
                pass

    async def unified_notify_user(self, user_id: int, message: str):
        sockets = list(self.user_sockets.get(user_id, []))
        ok = 0
        for ws in sockets:
            try:
                await ws.send_text(message)
                ok += 1
            except Exception:
                try:
                    self.user_sockets[user_id].remove(ws)
                except Exception:
                    pass
        try:
            logger.info(f"UnifiedNotifyUser user_id={user_id} sent={ok} total={(len(self.user_sockets.get(user_id, [])))}")
        except Exception:
            pass

    async def notify_all(self, message: str):
        # Broadcast to all connected notify sockets
        total = 0
        for user_id, sockets in list(self.user_notify_sockets.items()):
            for ws in list(sockets):
                try:
                    await ws.send_text(message)
                    total += 1
                except Exception:
                    self.disconnect_notify(user_id, ws)
        try:
            logger.info(f"NotifyAll total_sent={total} users={len(self.user_notify_sockets)}")
        except Exception:
            pass

    def user_connected(self, user_id: int):
        self.user_online_counts[user_id] = self.user_online_counts.get(user_id, 0) + 1

    def user_disconnected(self, user_id: int):
        if user_id in self.user_online_counts:
            self.user_online_counts[user_id] -= 1
            if self.user_online_counts[user_id] <= 0:
                del self.user_online_counts[user_id]


manager = ConnectionManager()


