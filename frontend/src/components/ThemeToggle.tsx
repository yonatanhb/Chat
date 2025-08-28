import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Sun, Moon, Laptop } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme === "system" ? systemTheme : theme;

  return (
    <div className="inline-flex items-center gap-1">
      <Button variant={current === "light" ? "default" : "ghost"} size="icon" onClick={() => setTheme("light")} aria-label="Light">
        <Sun className="h-4 w-4" />
      </Button>
      <Button variant={current === "dark" ? "default" : "ghost"} size="icon" onClick={() => setTheme("dark")} aria-label="Dark">
        <Moon className="h-4 w-4" />
      </Button>
      <Button variant={theme === "system" ? "default" : "ghost"} size="icon" onClick={() => setTheme("system")} aria-label="System">
        <Laptop className="h-4 w-4" />
      </Button>
    </div>
  );
}


