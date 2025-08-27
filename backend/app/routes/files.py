import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import models
from ..db import schemas
from ..deps.db import get_db
from ..deps.auth import get_current_user

router = APIRouter()


def files_dir() -> str:
    base = os.environ.get("FILES_DIR", "/app/files")
    os.makedirs(base, exist_ok=True)
    return base


def _validate_mime(filename: str, mime_type: str, size_bytes: int) -> None:
    allowed_prefixes = ["image/", "video/"]
    allowed_specific = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
    max_bytes = 50 * 1024 * 1024
    if size_bytes <= 0 or size_bytes > max_bytes:
        raise HTTPException(status_code=400, detail="File too large or empty")
    ok = any(mime_type.startswith(p) for p in allowed_prefixes) or mime_type in allowed_specific
    if not ok:
        raise HTTPException(status_code=400, detail="Unsupported file type")


@router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    data = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    _validate_mime(file.filename or "file", mime_type, len(data))
    nonce = (getattr(file, 'headers', {}) or {}).get('x-nonce') or (file.headers.get('x-nonce') if hasattr(file, 'headers') else None)
    if not nonce:
        raise HTTPException(status_code=400, detail="Missing nonce header")
    name = file.filename or f"file-{uuid.uuid4().hex}"
    uid = uuid.uuid4().hex
    path = os.path.join(files_dir(), uid)
    try:
        with open(path, 'wb') as f:
            f.write(data)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to store file")
    rec = models.Attachment(
        filename=name,
        stored_path=uid,
        mime_type=mime_type,
        size_bytes=len(data),
        uploaded_by=current_user.id,
        nonce=nonce,
        algo="AES-GCM",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {
        "id": rec.id,
        "filename": rec.filename,
        "mime_type": rec.mime_type,
        "size_bytes": rec.size_bytes,
        "nonce": rec.nonce,
        "algo": rec.algo,
    }


@router.get("/files/{file_id}")
def serve_file(file_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    att = db.query(models.Attachment).get(file_id)
    if not att:
        raise HTTPException(status_code=404, detail="Not found")
    msg = db.query(models.Message).filter(models.Message.attachment_id == file_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Not found")
    chat = db.query(models.Chat).get(msg.chat_id)
    if not chat or current_user.id not in [u.id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Forbidden")
    full = os.path.join(files_dir(), att.stored_path)
    if not os.path.exists(full):
        raise HTTPException(status_code=404, detail="Missing blob")
    def iterator():
        with open(full, 'rb') as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                yield chunk
    resp = StreamingResponse(iterator(), media_type=att.mime_type)
    resp.headers['x-nonce'] = att.nonce
    resp.headers['x-algo'] = att.algo
    resp.headers['Content-Disposition'] = f"inline; filename*=UTF-8''{att.filename}"
    return resp
