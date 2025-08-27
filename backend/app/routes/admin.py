from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..db import schemas
from ..controllers import users_controller
from ..deps.db import get_db
from ..deps.auth import get_current_user

router = APIRouter()


@router.get("/admin/users", response_model=List[schemas.UserOut])
def admin_list_users(db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not admin")
    return users_controller.list_users(db)


@router.post("/admin/users", response_model=schemas.UserOut)
async def admin_create_user(body: schemas.UserCreate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not admin")
    if users_controller.get_user_by_username(db, body.username):
        raise HTTPException(status_code=400, detail="Username exists")
    u = users_controller.create_user(db, body)
    return u


@router.put("/admin/users/{user_id}", response_model=schemas.UserOut)
def admin_update_user(user_id: int, body: schemas.UserUpdate, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not admin")
    u = users_controller.update_user(db, user_id, body)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u


@router.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not admin")
    ok = users_controller.delete_user(db, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
