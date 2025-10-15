export default function Home(){
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Home</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Inbox</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border rounded p-2"><span>Proposal awaiting review</span><span className="text-red-700 bg-red-50 border border-red-200 px-2 rounded-full">2</span></div>
            <div className="flex justify-between border rounded p-2"><span>Time entry approval</span><span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 rounded-full">Pending</span></div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Company News</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="border rounded p-2">Welcome our new PMs to the team</div>
            <div className="border rounded p-2">Safety training next week</div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-3">Quick Links</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <a className="border rounded p-2" href="/customers">Customers</a>
            <a className="border rounded p-2" href="/proposals">Proposals</a>
            <a className="border rounded p-2" href="/inventory">Inventory</a>
            <a className="border rounded p-2" href="/settings">Settings</a>
          </div>
        </div>
      </div>
    </div>
  );
}


