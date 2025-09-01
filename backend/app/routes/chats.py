from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..db import schemas, models
from ..controllers import chats_controller, messages_controller
from ..controllers import chat_state_controller
from ..deps.db import get_db
from ..deps.auth import get_current_user
from ..ws.ws_manager import manager
import asyncio
import json

router = APIRouter()
@router.get("/chats/{chat_id}/messages", response_model=list[schemas.MessageOut])
def list_chat_messages(chat_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if current_user.id not in [u.id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Forbidden")
    msgs = db.query(models.Message).filter(models.Message.chat_id == chat_id).order_by(models.Message.id.asc()).all()
    out: list[schemas.MessageOut] = []
    for m in msgs:
        out.append(schemas.MessageOut(
            id=m.id,
            content=m.content,
            content_type=m.content_type,
            timestamp=m.timestamp,
            ciphertext=m.ciphertext,
            nonce=m.nonce,
            algo=m.algo,
            recipient_id=m.recipient_id,
            sender=schemas.MessageOut._Sender(id=m.sender.id if m.sender else current_user.id, username=m.sender.username if m.sender else current_user.username),
            attachment=(schemas.MessageOut._Attachment(
                id=m.attachment.id,
                filename=m.attachment.filename,
                mime_type=m.attachment.mime_type,
                size_bytes=m.attachment.size_bytes,
                nonce=m.attachment.nonce,
                algo=m.attachment.algo,
            ) if m.attachment else None),
        ))
    return out


@router.post("/chats/private", response_model=schemas.ChatOut)
async def create_or_get_private_chat(body: schemas.PrivateChatRequest, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    target_id = body.target_user_id
    if target_id == current_user.id:
        existing_privates = db.query(models.Chat).filter(models.Chat.chat_type == "private").all()
        for c in existing_privates:
            ids = {u.id for u in c.participants}
            if ids == {current_user.id}:
                return c
        chat = models.Chat(chat_type="private")
        db.add(chat)
        db.commit()
        db.refresh(chat)
        me = db.query(models.User).get(current_user.id)
        if me and me not in chat.participants:
            chat.participants.append(me)
        db.commit()
        db.refresh(chat)
        return chat

    existing_privates = db.query(models.Chat).filter(models.Chat.chat_type == "private").all()
    for c in existing_privates:
        ids = {u.id for u in c.participants}
        if ids == {current_user.id, target_id}:
            return c

    chat = models.Chat(chat_type="private")
    db.add(chat)
    db.commit()
    db.refresh(chat)

    needed_ids = {current_user.id, target_id}
    for uid in needed_ids:
        user = db.query(models.User).get(uid)
        if user and user not in chat.participants:
            chat.participants.append(user)

    db.commit()
    db.refresh(chat)
    # Notify both participants that chats list changed
    try:
        import json as _json
        for uid in needed_ids:
            await manager.unified_notify_user(uid, _json.dumps({"v": 1, "type": "chats_changed"}))
    except Exception:
        pass
    return chat


@router.post("/chats/", response_model=schemas.ChatOut)
async def create_new_chat(chat: schemas.ChatCreate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    c = chats_controller.create_chat(db=db, chat=chat, creator_id=current_user.id)
    if c.chat_type == "group":
        title = c.name or f"צ'אט עם {len(c.participants)} משתתפים"
    else:
        if len(c.participants) == 1 and c.participants[0].id == current_user.id:
            title = "צ'אט עם עצמי"
        else:
            other = next((u for u in c.participants if u.id != current_user.id), None)
            title = f"צ'אט עם {other.username}" if other else None
    try:
        if c.chat_type == 'group':
            for u in c.participants:
                await manager.unified_notify_user(u.id, json.dumps({"v": 1, "type": "chats_changed"}))
        else:
            await manager.unified_broadcast_all(json.dumps({"v": 1, "type": "chats_changed"}))
    except Exception:
        pass
    return schemas.ChatOut(
        id=c.id,
        chat_type=c.chat_type,
        name=c.name,
        admin_user_id=getattr(c, "admin_user_id", None),
        participants=[schemas.UserBasic(id=u.id, username=u.username) for u in c.participants],
        title=title,
    )


@router.get("/chats/", response_model=List[schemas.ChatOut])
def get_user_chats(db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    existing = chats_controller.get_chats_for_user(db=db, user_id=current_user.id)
    has_self = False
    for c in existing:
        if c.chat_type == "private" and len(c.participants) == 1 and c.participants[0].id == current_user.id:
            has_self = True
            break
    if not has_self:
        chat = models.Chat(chat_type="private")
        db.add(chat)
        db.commit()
        db.refresh(chat)
        me = db.query(models.User).get(current_user.id)
        if me:
            chat.participants.append(me)
            db.commit()
            db.refresh(chat)
        existing = chats_controller.get_chats_for_user(db=db, user_id=current_user.id)
    
    # Get pinned chat IDs for current user
    pinned_chat_ids = set()
    try:
        pinned_chats = db.query(models.PinnedChat.chat_id).filter(
            models.PinnedChat.user_id == current_user.id
        ).all()
        pinned_chat_ids = {pc.chat_id for pc in pinned_chats}
    except Exception:
        # If PinnedChat table doesn't exist yet, just continue
        pass
    
    result: list[schemas.ChatOut] = []
    for c in existing:
        title = None
        if c.chat_type == "private":
            if len(c.participants) == 1 and c.participants[0].id == current_user.id:
                title = "צ'אט עם עצמי"
            else:
                other = next((u for u in c.participants if u.id != current_user.id), None)
                if other:
                    title = f"צ'אט עם {other.username}"
        else:
            title = c.name or f"צ'אט עם {len(c.participants)} משתתפים"
        # Get participant details for private chats
        participant_details = []
        for u in c.participants:
            participant_details.append(schemas.UserBasic(
                id=u.id, 
                username=u.username,
                first_name=getattr(u, 'first_name', None),
                last_name=getattr(u, 'last_name', None)
            ))
        
        out = schemas.ChatOut(
            id=c.id,
            chat_type=c.chat_type,
            admin_user_id=getattr(c, "admin_user_id", None),
            name=c.name,
            participants=participant_details,
            title=title,
            is_pinned=c.id in pinned_chat_ids,
        )
        result.append(out)
    return result


@router.post("/chats/{chat_id}/messages", response_model=schemas.MessageOut)
async def create_message(chat_id: int, body: schemas.MessageCreate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if current_user.id not in [u.id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Forbidden")
    saved_list = messages_controller.create_chat_message(db=db, message=body, chat_id=chat_id, sender_id=current_user.id)
    saved = saved_list[0]
    # Broadcast to room via WS
    try:
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
                "sender": {"id": current_user.id, "username": current_user.username},
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
        import json as _json
        # broadcast to room
        await manager.broadcast(_json.dumps(payload), str(chat_id))
        # notify only chat participants except sender
        participant_ids = [u.id for u in chat.participants if u.id != current_user.id]
        for uid in participant_ids:
            await manager.unified_notify_user(uid, _json.dumps({"v": 1, "type": "new_message", "chat_id": chat_id}))
    except Exception:
        pass
    return schemas.MessageOut(
        id=saved.id,
        content=saved.content,
        content_type=saved.content_type,
        timestamp=saved.timestamp,
        ciphertext=saved.ciphertext,
        nonce=saved.nonce,
        algo=saved.algo,
        recipient_id=saved.recipient_id,
        sender=schemas.MessageOut._Sender(id=current_user.id, username=current_user.username),
        attachment=(schemas.MessageOut._Attachment(
            id=saved.attachment.id,
            filename=saved.attachment.filename,
            mime_type=saved.attachment.mime_type,
            size_bytes=saved.attachment.size_bytes,
            nonce=saved.attachment.nonce,
            algo=saved.attachment.algo,
        ) if getattr(saved, 'attachment', None) else None),
    )


@router.get("/chats/{chat_id}/read-state", response_model=schemas.UserChatStateOut)
def get_read_state(chat_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if current_user.id not in [u.id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Forbidden")
    st = chat_state_controller.get_user_chat_state(db, current_user.id, chat_id)
    return schemas.UserChatStateOut(chat_id=chat_id, last_read_message_id=getattr(st, 'last_read_message_id', None))


@router.post("/chats/{chat_id}/read-state", response_model=schemas.UserChatStateOut)
async def set_read_state(chat_id: int, last_read_message_id: Optional[int] = None, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if current_user.id not in [u.id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Forbidden")
    st = chat_state_controller.upsert_user_chat_state(db, current_user.id, chat_id, last_read_message_id)
    # notify this user's other sessions to reset unread count
    try:
        import json as _json
        await manager.unified_notify_user(current_user.id, _json.dumps({"v": 1, "type": "unread_update", "chat_id": chat_id}))
    except Exception:
        pass
    return schemas.UserChatStateOut(chat_id=chat_id, last_read_message_id=st.last_read_message_id)


@router.get("/chats/unread-counts")
def get_unread_counts(db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    result: list[dict] = []
    chats = db.query(models.Chat).all()
    for c in chats:
        if current_user.id not in [u.id for u in c.participants]:
            continue
        st = chat_state_controller.get_user_chat_state(db, current_user.id, c.id)
        if st and st.last_read_message_id is not None:
            cnt = db.query(models.Message).filter(models.Message.chat_id == c.id, models.Message.id > st.last_read_message_id).count()
        else:
            cnt = db.query(models.Message).filter(models.Message.chat_id == c.id).count()
        result.append({"chat_id": c.id, "unread_count": int(cnt)})
    return result


@router.post("/chats/{chat_id}/members")
def add_chat_members(chat_id: int, body: schemas.AddMembersRequest, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.chat_type != 'group':
        raise HTTPException(status_code=400, detail="Not a group chat")
    if getattr(chat, 'admin_user_id', None) and chat.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not admin")
    updated = chats_controller.add_members(db, chat_id, body.member_ids)
    return {"id": updated.id}


@router.delete("/chats/{chat_id}/members")
async def remove_chat_members(chat_id: int, body: schemas.RemoveMembersRequest, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.chat_type != 'group':
        raise HTTPException(status_code=400, detail="Not a group chat")
    if getattr(chat, 'admin_user_id', None) and chat.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not admin")
    updated = chats_controller.remove_members(db, chat_id, body.member_ids)
    # Force-disconnect removed members from the WS room, and send notify to clear unread counter
    try:
        import json as _json
        for uid in body.member_ids:
            # disconnect from room
            manager.disconnect_user_from_room(str(chat_id), uid)
            # notify their notify sockets to clear badge for this chat
            await manager.unified_notify_user(uid, _json.dumps({"v": 1, "type": "unread_update", "chat_id": chat_id}))
            # also notify user they were removed from this chat
            await manager.unified_notify_user(uid, _json.dumps({"v": 1, "type": "removed_from_chat", "chat_id": chat_id}))
    except Exception:
        pass
    return {"id": updated.id}


@router.put("/chats/{chat_id}/name")
def rename_chat(chat_id: int, body: schemas.RenameChatRequest, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.chat_type != 'group':
        raise HTTPException(status_code=400, detail="Not a group chat")
    if getattr(chat, 'admin_user_id', None) and chat.admin_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not admin")
    chat.name = body.name
    db.commit()
    db.refresh(chat)
    return {
        "id": chat.id,
        "chat_type": chat.chat_type,
        "name": chat.name,
        "admin_user_id": getattr(chat, "admin_user_id", None),
        "participants": [schemas.UserBasic(id=u.id, username=u.username) for u in chat.participants],
    }
