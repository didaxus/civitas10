interface ActionBarProps {
  canCreateDocuments: boolean;
  onCreate?: () => void;
}

export const ActionBar = ({ canCreateDocuments, onCreate }: ActionBarProps) => {
  return (
    <div className="mb-6 flex justify-between items-center">
      {canCreateDocuments && (
        <button onClick={onCreate} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-contrast bg-primary hover:bg-primary-strong focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focus">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Document
        </button>
      )}
      <div className="flex items-center">
        <div className="relative">
          <input
            type="text"
            placeholder="Search documents..."
            className="w-64 px-4 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-focus focus:border-primary"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-muted absolute right-3 top-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
