from sqlalchemy import Table, Column, Integer, ForeignKey
from ..database import Base


chat_users_table = Table(
    "chat_users",
    Base.metadata,
    Column("chat_id", Integer, ForeignKey("chats.id"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
)


