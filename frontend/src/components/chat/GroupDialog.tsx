import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function GroupDialog({
  open,
  onOpenChange,
  approvedUsers,
  onCreate,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  approvedUsers: Array<{ user_id: number; username: string; is_self: boolean }>;
  onCreate: (name: string, memberIds: number[]) => Promise<void> | void;
  creating: boolean;
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setGroupName("");
          setSelectedUserIds(new Set());
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>יצירת קבוצה</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">תן שם לקבוצה</label>
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="שם הקבוצה" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">בחר משתתפים</span>
              <span className="text-xs text-muted-foreground">נבחרו {selectedUserIds.size}</span>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1">
              {approvedUsers
                .filter((u) => !u.is_self)
                .map((u) => {
                  const active = selectedUserIds.has(u.user_id);
                  return (
                    <button
                      key={u.user_id}
                      className={`w-full text-right px-2 py-1 rounded ${active ? "bg-blue-100" : "hover:bg-gray-50"}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedUserIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.user_id)) next.delete(u.user_id);
                          else next.add(u.user_id);
                          return next;
                        });
                      }}
                    >
                      {u.username}
                    </button>
                  );
                })}
              {approvedUsers.filter((u) => !u.is_self).length === 0 && (
                <div className="text-sm text-muted-foreground">אין משתמשים זמינים</div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button disabled={creating || !groupName.trim()} onClick={async () => {
            await onCreate(groupName.trim(), Array.from(selectedUserIds));
          }}>
            צור קבוצה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


