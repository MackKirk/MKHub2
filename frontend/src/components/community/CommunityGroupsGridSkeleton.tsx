export function CommunityGroupsGridSkeleton() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse" aria-busy="true" aria-label="Loading groups">
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <div key={k} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="p-4 flex gap-3">
            <div className="h-14 w-14 rounded-xl bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-100 rounded w-3/4" />
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-gray-100 rounded" />
                <div className="h-5 w-14 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
          <div className="px-4 pb-4 space-y-2">
            <div className="h-3 bg-gray-50 rounded w-full" />
            <div className="h-3 bg-gray-50 rounded w-2/3" />
          </div>
          <div className="border-t border-gray-100 p-4 flex gap-2">
            <div className="h-10 flex-1 bg-gray-100 rounded-lg" />
            <div className="h-10 w-24 bg-gray-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CommunityGroupsListSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden animate-pulse" aria-busy="true" aria-label="Loading groups">
      {[0, 1, 2, 3, 4].map((k) => (
        <div key={k} className="flex items-center gap-3 px-4 py-4 border-b border-gray-50 last:border-0">
          <div className="h-10 w-10 rounded-lg bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-gray-100 rounded max-w-[14rem]" />
            <div className="h-3 bg-gray-50 rounded max-w-[20rem]" />
          </div>
          <div className="h-8 w-20 bg-gray-100 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}
