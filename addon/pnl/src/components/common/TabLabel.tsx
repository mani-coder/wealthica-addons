interface TabLabelProps {
  label: string;
  isNew?: boolean;
}

export default function TabLabel({ label, isNew = false }: TabLabelProps) {
  return (
    <span>
      {label}
      {isNew && (
        <sup className="relative inline-flex items-center justify-center ml-0.5 h-3 w-3">
          <span className="absolute h-3 w-3 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-orange-300 opacity-75"></span>
          <span className="relative text-orange-500 text-xs">✦</span>
        </sup>
      )}
    </span>
  );
}
