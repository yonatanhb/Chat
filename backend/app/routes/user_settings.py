from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..deps.db import get_db
from ..db.schemas import UserSettings, UserSettingsUpdate
from ..deps.auth import get_current_user
from ..db.models import User, UserSettings as UserSettingsModel

router = APIRouter(prefix="/user-settings", tags=["user-settings"])


@router.get("/", response_model=UserSettings)
async def get_user_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user settings"""
    user_settings = db.query(UserSettingsModel).filter(
        UserSettingsModel.user_id == current_user.id
    ).first()
    
    if not user_settings:
        # Create default settings
        user_settings = UserSettingsModel(
            user_id=current_user.id,
            pinned_chats_limit=3
        )
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)
    
    return user_settings


@router.put("/", response_model=UserSettings)
async def update_user_settings(
    settings_update: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user settings"""
    user_settings = db.query(UserSettingsModel).filter(
        UserSettingsModel.user_id == current_user.id
    ).first()
    
    if not user_settings:
        # Create default settings
        user_settings = UserSettingsModel(
            user_id=current_user.id,
            pinned_chats_limit=3
        )
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)
    
    # Validate pinned_chats_limit
    if settings_update.pinned_chats_limit is not None:
        if settings_update.pinned_chats_limit < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pinned chats limit must be at least 1"
            )
        
        if settings_update.pinned_chats_limit > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pinned chats limit cannot exceed 5"
            )
        
        # Check if current pinned chats exceed new limit
        from ..db.models import PinnedChat as PinnedChatModel
        current_pinned_count = db.query(PinnedChatModel).filter(
            PinnedChatModel.user_id == current_user.id
        ).count()
        
        if current_pinned_count > settings_update.pinned_chats_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reduce limit below current pinned chats count ({current_pinned_count})"
            )
        
        user_settings.pinned_chats_limit = settings_update.pinned_chats_limit
    
    db.commit()
    db.refresh(user_settings)
    
    return user_settings


@router.post("/pin-chat")
async def pin_chat_endpoint(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Pin a chat for the current user"""
    chat_id = request.get("chat_id")
    if not chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="chat_id is required"
        )
    
    # Check if user already has this chat pinned
    from ..db.models import PinnedChat as PinnedChatModel
    existing = db.query(PinnedChatModel).filter(
        PinnedChatModel.user_id == current_user.id,
        PinnedChatModel.chat_id == chat_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat is already pinned"
        )
    
    # Get user settings to check limit
    user_settings = db.query(UserSettingsModel).filter(
        UserSettingsModel.user_id == current_user.id
    ).first()
    
    if not user_settings:
        # Create default settings
        user_settings = UserSettingsModel(
            user_id=current_user.id,
            pinned_chats_limit=3
        )
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)
    
    # Check if user has reached the limit
    current_pinned_count = db.query(PinnedChatModel).filter(
        PinnedChatModel.user_id == current_user.id
    ).count()
    
    if current_pinned_count >= user_settings.pinned_chats_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum pinned chats limit reached ({user_settings.pinned_chats_limit})"
        )
    
    # Create new pinned chat
    new_pinned_chat = PinnedChatModel(
        user_id=current_user.id,
        chat_id=chat_id
    )
    
    db.add(new_pinned_chat)
    db.commit()
    
    return {"message": "Chat pinned successfully"}


@router.post("/unpin-chat")
async def unpin_chat_endpoint(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unpin a chat for the current user"""
    chat_id = request.get("chat_id")
    if not chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="chat_id is required"
        )
    
    from ..db.models import PinnedChat as PinnedChatModel
    pinned_chat = db.query(PinnedChatModel).filter(
        PinnedChatModel.user_id == current_user.id,
        PinnedChatModel.chat_id == chat_id
    ).first()
    
    if not pinned_chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pinned chat not found"
        )
    
    db.delete(pinned_chat)
    db.commit()
    
    return {"message": "Chat unpinned successfully"}
