interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <span className="text-4xl">{icon}</span>
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-[200px]">{subtitle}</p>}
      {action && (
        <button onClick={action.onClick} className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-medium">
          {action.label}
        </button>
      )}
    </div>
  );
}
