import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function GroupMembersDialog({
  open,
  onOpenChange,
  chat,
  myId,
  approvedUsers,
  onRename,
  onAddMembers,
  onRemoveMember,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: any | null;
  myId: number | null;
  approvedUsers: Array<{ user_id: number; username: string; is_self: boolean }>;
  onRename: (name: string) => Promise<void> | void;
  onAddMembers: (ids: number[]) => Promise<void> | void;
  onRemoveMember: (id: number) => Promise<void> | void;
}) {
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const isAdmin = Boolean(chat && chat.chat_type === "group" && chat.admin_user_id === myId);
  const members = chat?.participants ?? [];
  const otherUsers = approvedUsers.filter((u) => !u.is_self && !members.some((m: any) => m.id === u.user_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>פרטי קבוצה</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm">שם קבוצה</div>
            <div className="flex gap-2 items-center">
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder={chat?.name ?? chat?.title ?? ""} disabled={!isAdmin} />
              {isAdmin && (
                <Button size="sm" disabled={renaming || !renameValue.trim()} onClick={async () => {
                  setRenaming(true);
                  try {
                    await onRename(renameValue.trim());
                    setRenameValue("");
                  } finally {
                    setRenaming(false);
                  }
                }}>
                  שנה
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm">חברים</div>
            <ul className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
              {members.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between">
                  <span>{m.username}</span>
                  {isAdmin && m.id !== myId && (
                    <Button size="sm" variant="outline" onClick={() => onRemoveMember(m.id)}>
                      הסר
                    </Button>
                  )}
                </li>
              ))}
              {members.length === 0 && <li className="text-sm text-muted-foreground">אין משתתפים</li>}
            </ul>
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <div className="text-sm">הוסף משתתפים</div>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {otherUsers.map((u) => (
                  <button key={u.user_id} className="w-full text-right px-2 py-1 rounded hover:bg-gray-50" onClick={() => onAddMembers([u.user_id])}>
                    {u.username}
                  </button>
                ))}
                {otherUsers.length === 0 && (
                  <div className="text-sm text-muted-foreground">אין משתמשים זמינים להוספה</div>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


