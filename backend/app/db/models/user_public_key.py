import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from ..database import Base


class UserPublicKey(Base):
    __tablename__ = "user_public_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    public_key_jwk = Column(Text, nullable=False)
    algorithm = Column(String, default="ECDH-P-256", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))


