from datetime import timedelta
import logging

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from .db.database import SessionLocal, engine
from .db import models
from .routes.files import router as files_router
from .routes.auth_routes import router as auth_router
from .routes.chats import router as chats_router
from .routes.admin import router as admin_router
from .routes.users import router as users_router
from .routes.crypto import router as crypto_router
from .ws.sockets import ws_router

models.Base.metadata.create_all(bind=engine)


app = FastAPI(title="Secure LAN Live Chat")
logger = logging.getLogger(__name__)

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(files_router)
app.include_router(auth_router)
app.include_router(chats_router)
app.include_router(admin_router)
app.include_router(users_router)
app.include_router(ws_router)
app.include_router(crypto_router)


@app.get("/")
async def read_root():
    return {"message": "Welcome to the Secure LAN Chat Server"}
