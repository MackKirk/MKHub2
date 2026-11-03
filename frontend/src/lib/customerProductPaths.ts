/** Resolve Hub vs Metals customer API and UI paths from the current location. */

export function isMetalsCustomersPath(pathname: string): boolean {
  return pathname === '/metals/customers' || pathname.startsWith('/metals/customers/');
}

/** Quotes always use Metals CRM customers. */
export function isQuotesPath(pathname: string): boolean {
  return pathname === '/quotes' || pathname.startsWith('/quotes/');
}

export function customersApiBase(pathname: string): string {
  if (isMetalsCustomersPath(pathname) || isQuotesPath(pathname)) return '/metals/clients';
  return '/clients';
}

export function customersListApi(pathname: string): string {
  return customersApiBase(pathname);
}

export function customersCreateApi(pathname: string): string {
  return customersApiBase(pathname);
}

export function customersUiBase(pathname: string): string {
  return isMetalsCustomersPath(pathname) || isQuotesPath(pathname) ? '/metals/customers' : '/customers';
}

export function customerDetailPath(pathname: string, clientId: string): string {
  return `${customersUiBase(pathname)}/${encodeURIComponent(clientId)}`;
}
