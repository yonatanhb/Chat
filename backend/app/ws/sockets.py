from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, status, Depends
from sqlalchemy.orm import Session
import json
import logging

from .ws_manager import manager
from ..db.database import SessionLocal
from ..deps.auth import get_current_user
from ..db import schemas
from ..controllers import messages_controller
from ..db.models import Chat

ws_router = APIRouter()
logger = logging.getLogger(__name__)


# Deprecated endpoints removed after migration to unified WS


@ws_router.websocket("/ws")
async def websocket_unified(websocket: WebSocket):
    # Authenticate using a short-lived DB session, then close it
    db = SessionLocal()
    try:
        logger.info("WS /ws connection attempt")
    except Exception:
        pass
    token = None
    try:
        token = websocket.query_params.get("token")  # type: ignore[attr-defined]
    except Exception:
        token = None
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    try:
        user = await get_current_user(db=db, token=token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    finally:
        try:
            db.close()
        except Exception:
            pass
    await websocket.accept()
    try:
        logger.info(f"WS accepted user_id={user.id}")
    except Exception:
        pass
    manager.register_user_socket(user.id, websocket)
    try:
        manager.user_connected(user.id)
        logger.info(f"Presence: user_connected user_id={user.id} count={manager.user_online_counts.get(user.id)}")
    except Exception:
        pass
    try:
        # Initial presence snapshot
        try:
            await websocket.send_text(json.dumps({
                "v": 1,
                "type": "presence_snapshot",
                "online_user_ids": list(manager.user_online_counts.keys()),
            }))
            try:
                logger.info(f"WS presence_snapshot sent user_id={user.id} online_count={len(manager.user_online_counts)}")
            except Exception:
                pass
        except Exception:
            pass
        # Broadcast presence online to unified sockets
        try:
            await manager.unified_broadcast_all(json.dumps({"v": 1, "type": "presence", "user_id": user.id, "online": True}))
            try:
                logger.info(f"WS presence online broadcast user_id={user.id}")
            except Exception:
                pass
        except Exception:
            pass
        # Main loop
        while True:
            data = await websocket.receive_json()
            t = data.get("type")
            try:
                logger.info(f"WS received type={t} user_id={user.id}")
            except Exception:
                pass
            if t == "subscribe":
                chat_id = int(data.get("chat_id"))
                # Auth check: membership (short-lived DB session)
                _db = SessionLocal()
                try:
                    ok = _db.query(Chat).filter(Chat.id == chat_id, Chat.participants.any(id=user.id)).first() is not None
                    if not ok:
                        await websocket.send_text(json.dumps({"v": 1, "type": "error", "code": "FORBIDDEN", "message": "Not a member"}))
                        try:
                            logger.warning(f"WS subscribe forbidden user_id={user.id} chat_id={chat_id}")
                        except Exception:
                            pass
                        continue
                finally:
                    try:
                        _db.close()
                    except Exception:
                        pass
                manager.subscribe_room(websocket, user.id, str(chat_id))
                await websocket.send_text(json.dumps({"v": 1, "type": "subscribed", "chat_id": chat_id}))
                try:
                    logger.info(f"WS subscribed user_id={user.id} chat_id={chat_id}")
                except Exception:
                    pass
            elif t == "unsubscribe":
                chat_id = int(data.get("chat_id"))
                manager.unsubscribe_room(websocket, str(chat_id))
                await websocket.send_text(json.dumps({"v": 1, "type": "unsubscribed", "chat_id": chat_id}))
                try:
                    logger.info(f"WS unsubscribed user_id={user.id} chat_id={chat_id}")
                except Exception:
                    pass
            elif t == "send_message":
                chat_id = int(data.get("chat_id"))
                _db = SessionLocal()
                try:
                    # Auth check
                    ok = _db.query(Chat).filter(Chat.id == chat_id, Chat.participants.any(id=user.id)).first() is not None
                    if not ok:
                        await websocket.send_text(json.dumps({"v": 1, "type": "error", "code": "FORBIDDEN", "message": "Not a member"}))
                        try:
                            logger.warning(f"WS send_message forbidden user_id={user.id} chat_id={chat_id}")
                        except Exception:
                            pass
                        continue
                    message = schemas.MessageCreate(
                        content=data.get("content"),
                        content_type=data.get("content_type", "text"),
                        ciphertext=data.get("ciphertext"),
                        nonce=data.get("nonce"),
                        algo=data.get("algo"),
                        attachment_id=data.get("attachment_id"),
                    )
                    saved_messages = messages_controller.create_chat_message(db=_db, message=message, chat_id=chat_id, sender_id=user.id)
                    try:
                        logger.info(f"WS send_message saved user_id={user.id} chat_id={chat_id} count={len(saved_messages)}")
                    except Exception:
                        pass
                    # Broadcast each saved message to room and send notify to each participant
                    for saved in saved_messages:
                        payload = {
                            "v": 1,
                            "type": "message",
                            "chat_id": chat_id,
                            "message": {
                                "id": saved.id,
                                "content": saved.content,
                                "ciphertext": saved.ciphertext,
                                "nonce": saved.nonce,
                                "algo": saved.algo,
                                "timestamp": (saved.timestamp.isoformat() if getattr(saved, "timestamp", None) else None),
                                "sender": {"id": user.id, "username": user.username},
                                "attachment": ({
                                    "id": saved.attachment_id,
                                    "filename": getattr(saved.attachment, 'filename', None),
                                    "mime_type": getattr(saved.attachment, 'mime_type', None),
                                    "size_bytes": getattr(saved.attachment, 'size_bytes', None),
                                    "nonce": getattr(saved.attachment, 'nonce', None),
                                    "algo": getattr(saved.attachment, 'algo', None),
                                } if getattr(saved, 'attachment_id', None) else None),
                            },
                        }
                        await manager.broadcast_room(str(chat_id), json.dumps(payload))
                    try:
                        logger.info(f"WS broadcast message user_id={user.id} chat_id={chat_id}")
                    except Exception:
                        pass
                    # Lightweight notify to all participants (including not subscribed sockets)
                    try:
                        chat_rec = _db.query(Chat).get(chat_id)  # type: ignore
                        pids = [p.id for p in chat_rec.participants] if chat_rec else []
                    except Exception:
                        pids = []
                    for pid in pids:
                        try:
                            await manager.unified_notify_user(pid, json.dumps({"v": 1, "type": "new_message", "chat_id": chat_id}))
                        except Exception:
                            pass
                    try:
                        logger.info(f"WS notified participants chat_id={chat_id} recipients={len(pids)}")
                    except Exception:
                        pass
                finally:
                    try:
                        _db.close()
                    except Exception:
                        pass
            else:
                await websocket.send_text(json.dumps({"v": 1, "type": "error", "code": "INVALID_PAYLOAD"}))
                try:
                    logger.warning(f"WS invalid payload user_id={user.id} data={data}")
                except Exception:
                    pass
    except WebSocketDisconnect:
        manager.unregister_user_socket(user.id, websocket)
        try:
            manager.user_disconnected(user.id)
            logger.info(f"Presence: user_disconnected user_id={user.id} count={manager.user_online_counts.get(user.id)}")
        except Exception:
            pass
        try:
            await manager.unified_broadcast_all(json.dumps({"v": 1, "type": "presence", "user_id": user.id, "online": False}))
        except Exception:
            pass
        try:
            logger.info(f"WS disconnect user_id={user.id}")
        except Exception:
            pass
    except Exception:
        manager.unregister_user_socket(user.id, websocket)
        try:
            manager.user_disconnected(user.id)
        except Exception:
            pass
        try:
            await manager.broadcast_all(json.dumps({"v": 1, "type": "presence", "user_id": user.id, "online": False}))
        except Exception:
            pass
        try:
            logger.exception(f"WS error user_id={user.id}")
        except Exception:
            pass
    finally:
        # No long-lived DB session to close here; already closed per operation
        pass

