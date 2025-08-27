import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint
from ..database import Base


class GroupKeyShare(Base):
    __tablename__ = "group_key_shares"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    provider_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    wrapped_key_ciphertext = Column(Text, nullable=False)
    wrapped_key_nonce = Column(String, nullable=False)
    algo = Column(String, default="AES-GCM", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    __table_args__ = (
        UniqueConstraint("chat_id", "recipient_user_id", name="uq_group_key_recipient"),
    )


