// Geo loader using public API (countriesnow.space)
// - Countries list: GET https://countriesnow.space/api/v0.1/countries
// - States: POST https://countriesnow.space/api/v0.1/countries/states { country }
// - Cities: POST https://countriesnow.space/api/v0.1/countries/state/cities { country, state }
(function(){
  const API_BASE = 'https://countriesnow.space/api/v0.1';

  async function fetchJSON(url, opts){
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error('geo api error');
    return r.json();
  }

  async function load(){
    try {
      const res = await fetchJSON(`${API_BASE}/countries`);
      // shape: { data: [{ country: 'Canada', cities: [...] }, ...] }
      const countries = (res && res.data) ? res.data.map(c=>({ name: c.country, cities: c.cities||[] })) : [];
      window.MKHubGeo = { data: countries, load, getStates, getCities };
      return countries;
    } catch(e){
      window.MKHubGeo = { data: [], load, getStates, getCities };
      return [];
    }
  }

  async function getStates(country){
    try {
      const res = await fetchJSON(`${API_BASE}/countries/states`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ country }) });
      return (res && res.data && res.data.states) ? res.data.states.map(s=>s.name) : [];
    } catch(e){ return []; }
  }

  async function getCities(country, state){
    try {
      if (state){
        const res = await fetchJSON(`${API_BASE}/countries/state/cities`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ country, state }) });
        return (res && res.data) ? res.data : [];
      }
      // fallback to country-level cities if state not chosen
      const c = (window.MKHubGeo.data||[]).find(x=>x.name===country);
      return c && c.cities ? c.cities : [];
    } catch(e){ return []; }
  }

  window.MKHubGeo = { data: [], load, getStates, getCities };
})();


