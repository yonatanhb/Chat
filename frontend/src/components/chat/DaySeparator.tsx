type Props = { label: string };

export function DaySeparator({ label }: Props) {
  return (
    <div className="text-center text-xs text-muted-foreground my-3">— {label} —</div>
  );
}


