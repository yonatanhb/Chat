from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, status, Depends
from sqlalchemy.orm import Session
import json

from .ws_manager import manager
from ..db.database import SessionLocal
from ..deps.auth import get_current_user
from ..db import schemas
from ..controllers import messages_controller

ws_router = APIRouter()


@ws_router.websocket("/ws/notify")
async def websocket_notify_query(websocket: WebSocket):
    db = SessionLocal()
    token = None
    try:
        token = websocket.query_params.get("token")  # type: ignore[attr-defined]
    except Exception:
        token = None
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return
    try:
        user = await get_current_user(db=db, token=token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return
    await manager.connect_notify(user.id, websocket)
    try:
        try:
            await websocket.send_text(json.dumps({"type": "notify_connected"}))
        except Exception:
            manager.disconnect_notify(user.id, websocket)
            return
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_notify(user.id, websocket)
    except Exception:
        manager.disconnect_notify(user.id, websocket)
    finally:
        db.close()


@ws_router.websocket("/ws/{chat_id}/{token}")
async def websocket_endpoint(websocket: WebSocket, chat_id: int, token: str):
    db = SessionLocal()
    try:
        user = await get_current_user(db=db, token=token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    await manager.connect(websocket, str(chat_id), user.id)
    manager.user_connected(user.id)
    try:
        try:
            await websocket.send_text(json.dumps({
                "type": "presence_snapshot",
                "online_user_ids": list(manager.user_online_counts.keys()),
            }))
        except Exception:
            pass
        await manager.broadcast_all(json.dumps({"type": "presence", "user_id": user.id, "online": True}))
    except Exception:
        pass
    try:
        while True:
            data = await websocket.receive_json()
            message = schemas.MessageCreate(
                content=data.get("content"),
                content_type=data.get("content_type", "text"),
                ciphertext=data.get("ciphertext"),
                nonce=data.get("nonce"),
                algo=data.get("algo"),
            )
            saved_messages = messages_controller.create_chat_message(db=db, message=message, chat_id=chat_id, sender_id=user.id)
            for saved in saved_messages:
                payload = {
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
                await manager.broadcast(json.dumps(payload), str(chat_id))
    except WebSocketDisconnect:
        manager.disconnect(websocket, str(chat_id))
        manager.user_disconnected(user.id)
        try:
            await manager.broadcast_all(json.dumps({"type": "presence", "user_id": user.id, "online": False}))
        except Exception:
            pass
    finally:
        db.close()
