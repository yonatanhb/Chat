from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..db import schemas, models
from ..controllers import users_controller
from ..deps.db import get_db
from ..deps.auth import get_current_user

router = APIRouter()


@router.get("/users/me/", response_model=schemas.UserOut)
async def read_users_me(current_user: schemas.User = Depends(get_current_user)):
  return current_user


@router.get("/users/approved-peers", response_model=List[schemas.PeerOut])
def get_approved_peers(db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
  users = db.query(models.User).all()
  approved_user_ids = {u.id for u in users if u.id != current_user.id}
  chats = db.query(models.Chat).filter(models.Chat.chat_type == "private").all()
  user_id_to_chat_id: dict[int, int] = {}
  for c in chats:
    ids = [u.id for u in c.participants]
    if current_user.id in ids:
      if len(ids) == 1 and ids[0] == current_user.id:
        user_id_to_chat_id[current_user.id] = c.id
      if len(ids) == 2:
        other = ids[0] if ids[1] == current_user.id else ids[1]
        user_id_to_chat_id[other] = c.id
  peers: list[schemas.PeerOut] = []
  peers.append(schemas.PeerOut(user_id=current_user.id, username=current_user.username, chat_id=user_id_to_chat_id.get(current_user.id), is_self=True))
  for uid in sorted(approved_user_ids):
    if uid == current_user.id:
      continue
    u = db.query(models.User).get(uid)
    if not u:
      continue
    peers.append(schemas.PeerOut(user_id=u.id, username=u.username, chat_id=user_id_to_chat_id.get(u.id), is_self=False))
  return peers
