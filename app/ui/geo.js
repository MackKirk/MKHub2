// Geo loader: countries -> states/provinces -> cities
// Looks for /ui/geo.json with shape:
// [ { name: "Canada", iso2: "CA", states: [ { name: "British Columbia", cities: [ { name: "Vancouver" } ] } ] } ]
// If not found, falls back to a small built-in set (CA/US).
(function(){
  const fallback = [
    { name: "Canada", iso2: "CA", states: [
      { name: "British Columbia", cities: [{name:"Vancouver"},{name:"Victoria"},{name:"Kelowna"}] },
      { name: "Alberta", cities: [{name:"Calgary"},{name:"Edmonton"}] },
      { name: "Ontario", cities: [{name:"Toronto"},{name:"Ottawa"},{name:"Mississauga"}] },
      { name: "Quebec", cities: [{name:"Montreal"},{name:"Quebec City"}] }
    ]},
    { name: "United States", iso2: "US", states: [
      { name: "California", cities: [{name:"Los Angeles"},{name:"San Francisco"},{name:"San Diego"}] },
      { name: "New York", cities: [{name:"New York"},{name:"Buffalo"}] },
      { name: "Texas", cities: [{name:"Houston"},{name:"Dallas"},{name:"Austin"}] }
    ]},
  ];

  async function loadGeo(){
    try {
      const r = await fetch('/ui/geo.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('not found');
      const data = await r.json();
      window.MKHubGeo = { data };
      return data;
    } catch(e){
      window.MKHubGeo = { data: fallback };
      return fallback;
    }
  }

  window.MKHubGeo = { data: [], load: loadGeo };
})();


