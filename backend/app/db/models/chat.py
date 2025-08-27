from sqlalchemy import Column, Integer, String, Enum, ForeignKey
from sqlalchemy.orm import relationship
from ..database import Base
from .association import chat_users_table


class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, index=True)
    chat_type = Column(Enum("group", "private", name="chat_type_enum"), nullable=False)
    name = Column(String, nullable=True)
    admin_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    messages = relationship("Message", back_populates="chat")
    participants = relationship("User", secondary=chat_users_table, back_populates="chats")


