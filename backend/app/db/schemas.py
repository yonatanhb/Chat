from pydantic import BaseModel
import datetime
from typing import List, Optional


class UserBase(BaseModel):
    username: str
    role: str = "user"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    signup_ip: Optional[str] = None
    signup_at: Optional[datetime.datetime] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


class User(UserBase):
    id: int
    chats: List["Chat"] = []

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class MessageBase(BaseModel):
    content: Optional[str] = None
    content_type: str = "text"


class MessageCreate(MessageBase):
    # For E2EE, when sending encrypted payloads
    ciphertext: Optional[str] = None
    nonce: Optional[str] = None
    algo: Optional[str] = None
    # For group E2EE fan-out
    class EncryptedItem(BaseModel):
        recipient_id: int
        ciphertext: str
        nonce: str
        algo: Optional[str] = None
    items: Optional[List[EncryptedItem]] = None
    # Optional attachment id (from prior upload)
    attachment_id: Optional[int] = None


class Message(MessageBase):
    id: int
    chat_id: int
    sender_id: int
    timestamp: datetime.datetime
    ciphertext: Optional[str] = None
    nonce: Optional[str] = None
    algo: Optional[str] = None
    recipient_id: Optional[int] = None

    class Config:
        from_attributes = True


class ChatBase(BaseModel):
    chat_type: str
    name: Optional[str] = None
    admin_user_id: Optional[int] = None


class ChatCreate(ChatBase):
    participant_ids: List[int] = []


class Chat(ChatBase):
    id: int
    participants: List[User] = []
    messages: List[Message] = []

    class Config:
        from_attributes = True


# Shallow types for safe responses
class UserBasic(BaseModel):
    id: int
    username: str

    class Config:
        from_attributes = True


class ChatOut(BaseModel):
    id: int
    chat_type: str
    name: Optional[str] = None
    admin_user_id: Optional[int] = None
    participants: List[UserBasic] = []
    title: Optional[str] = None
    is_pinned: bool = False

    class Config:
        from_attributes = True


# Update forward reference
User.update_forward_refs()


class AdminLoginRequest(BaseModel):
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    signup_ip: Optional[str] = None
    signup_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class MachineBase(BaseModel):
    ip_address: str
    user_id: int


class MachineOut(BaseModel):
    id: int
    ip_address: str
    # Return a shallow user to avoid recursive serialization
    class _MachineUser(BaseModel):
        id: int
        username: str

        class Config:
            from_attributes = True

    user: Optional[_MachineUser] = None
    approved: bool
    is_admin: bool

    class Config:
        from_attributes = True


class PrivateChatRequest(BaseModel):
    target_user_id: int


class AddMembersRequest(BaseModel):
    member_ids: List[int]


class RemoveMembersRequest(BaseModel):
    member_ids: List[int]


class RenameChatRequest(BaseModel):
    name: str

class MessageOut(BaseModel):
    id: int
    content: Optional[str] = None
    content_type: str
    timestamp: datetime.datetime
    ciphertext: Optional[str] = None
    nonce: Optional[str] = None
    algo: Optional[str] = None
    recipient_id: Optional[int] = None
    class _Sender(BaseModel):
        id: int
        username: str
        class Config:
            from_attributes = True
    sender: _Sender
    class _Attachment(BaseModel):
        id: int
        filename: str
        mime_type: str
        size_bytes: int
        nonce: str
        algo: str
        class Config:
            from_attributes = True
    attachment: Optional[_Attachment] = None

    class Config:
        from_attributes = True


class PeerOut(BaseModel):
    user_id: int
    username: str
    chat_id: Optional[int] = None
    is_self: bool = False

    class Config:
        from_attributes = True


class UserChatStateOut(BaseModel):
    chat_id: int
    last_read_message_id: Optional[int] = None

    class Config:
        from_attributes = True


class PublicKeyIn(BaseModel):
    public_key_jwk: str
    algorithm: str = "ECDH-P-256"


class PublicKeyOut(BaseModel):
    user_id: int
    public_key_jwk: str
    algorithm: str

    class Config:
        from_attributes = True


class RegisterIn(BaseModel):
    username: str
    first_name: str
    last_name: str
    password: str
    public_key_jwk: str
    algorithm: str = "ECDH-P-256"


class GroupKeyWrapIn(BaseModel):
    chat_id: int
    recipient_user_id: int
    wrapped_key_ciphertext: str
    wrapped_key_nonce: str
    algo: str = "AES-GCM"


class GroupKeyWrapOut(BaseModel):
    chat_id: int
    provider_user_id: int
    recipient_user_id: int
    wrapped_key_ciphertext: str
    wrapped_key_nonce: str
    algo: str


class LoginWithKeyIn(BaseModel):
    public_key_jwk: str
    password: str


# Pinned Chat Schemas
class PinnedChatBase(BaseModel):
    chat_id: int


class PinnedChatCreate(PinnedChatBase):
    pass


class PinnedChat(PinnedChatBase):
    id: int
    user_id: int
    pinned_at: datetime.datetime

    class Config:
        from_attributes = True


# User Settings Schemas
class UserSettingsBase(BaseModel):
    pinned_chats_limit: int


class UserSettingsCreate(UserSettingsBase):
    pass


class UserSettingsUpdate(BaseModel):
    pinned_chats_limit: Optional[int] = None


class UserSettings(UserSettingsBase):
    id: int
    user_id: int
    created_at: datetime.datetime
    updated_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


# Update User schema to include settings
class UserWithSettings(User):
    settings: Optional[UserSettings] = None


