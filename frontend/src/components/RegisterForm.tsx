import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

type Props = { error: string | null };

export function RegisterForm({ error }: Props) {
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>הרשמה</CardTitle>
        <ThemeToggle />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border p-3 bg-muted/40 text-sm leading-6">
          <div className="font-medium mb-1">מה זה פה ולמה הגעתי לכאן? 🤔</div>
          <p className="mb-2">
            אם אתה רואה את המסך הזה, סימן שעדיין אין לך מפתח הצפנה מקומי. לפני
            שמתחילים לצ׳וטט, אנחנו יוצרים עבורך זוג מפתחות ומכינים את הקריפטו –
            הכל אצלך בדפדפן.
          </p>
          <div className="font-medium mb-1">
            איך זה עובד בקצרה (ולא, אין פה עננים מסתוריים) ☁️🚫
          </div>
          <ul className="list-disc pr-5 space-y-1">
            <li>מייצרים זוג מפתחות ECDH בדפדפן. כן, אצלך, בג׳אווה־סקריפט.</li>
            <li>
              המפתח הפרטי מוצפן בסיסמה ונשמר מקומית . הפרטי לא יוצא מהדפדפן.
            </li>
            <li>
              המפתח הציבורי נשלח לשרת כדי שחברים יוכלו להצפין אליך הודעות.
            </li>
          </ul>
          <p className="mt-2">
            TL;DR: אנחנו לא רואים את ההודעות שלך, וגם לא רוצים. יש לנו מספיק
            באגים משלנו לטפל בהם 🐛
          </p>
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3">
            חשוב לדעת: אם המפתח הפרטי המקומי יימחק, או שתאבד את הסיסמה שמצפינה
            אותו – אי אפשר יהיה לפענח הודעות ישנות. אין לנו עותק בשרת, וזה
            בכוונה.
          </div>
        </div>

        {error && (
          <div className="text-sm text-destructive">שגיאה: {error}</div>
        )}
        {formError && (
          <div className="text-sm text-destructive">{formError}</div>
        )}

        <Input
          placeholder="שם משתמש"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="שם פרטי"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            placeholder="שם משפחה"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <Input
          type="password"
          placeholder="סיסמה"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="flex gap-2">
          <Button
            className="w-full"
            disabled={isLoading}
            onClick={async () => {
              if (
                !username.trim() ||
                !firstName.trim() ||
                !lastName.trim() ||
                !password.trim()
              ) {
                setFormError("נא למלא את כל השדות");
                return;
              }
              setFormError(null);
              const result = await register({
                username,
                first_name: firstName,
                last_name: lastName,
                password,
              });
              if (result.ok) {
                navigate("/login", { replace: true });
              } else if (result.message) {
                setFormError(result.message);
              } else {
                setFormError("הרשמה נכשלה");
              }
            }}
          >
            הרשמה
          </Button>
        </div>

        <div className="text-sm text-muted-foreground text-center">
          כבר יש לך מפתח?{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => navigate("/key-import")}
          >
            לחץ כאן
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
