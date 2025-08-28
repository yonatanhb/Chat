import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { AlertTriangle, Trash2, ArrowLeft } from "lucide-react";
import { clearAllCryptoState } from "@/lib/e2ee";
import { useState } from "react";

export function ResetAccountView() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div className="w-screen h-screen overflow-hidden bg-background text-foreground grid grid-cols-1 min-h-0 box-border p-6">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold inline-flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" /> איפוס חשבון
          </h1>
          <Button variant="ghost" onClick={() => navigate("/login")}>
            <ArrowLeft className="h-4 w-4 ml-1" /> חזרה
          </Button>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="font-medium">מה הולך לקרות?</div>
          <ul className="list-disc pr-5 text-sm space-y-1">
            <li>נמחק את המפתח הפרטי המקומי מהמכשיר הזה.</li>
            <li>לא נוכל לפענח הודעות ישנות – זה בלתי הפיך ללא גיבוי.</li>
            <li>תועבר/י לעמוד הרשמה ליצירת מפתח חדש ולהמשך שימוש.</li>
          </ul>
          <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3 text-sm">
            פעולה מסוכנת: אין דרך לשחזר היסטוריה לאחר מחיקה. ודא/י שיש לך גיבוי אם חשוב לך לשמור גישה להודעות ישנות.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate("/login")}>בטל</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await clearAllCryptoState();
                  navigate("/register", { replace: true });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4 ml-1" /> מחק והמשך לרישום
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


