/** Resolve Hub vs Metals customer API and UI paths from the current location. */

export function isMetalsCustomersPath(pathname: string): boolean {
  return pathname === '/metals/customers' || pathname.startsWith('/metals/customers/');
}

export function customersListApi(pathname: string): string {
  return isMetalsCustomersPath(pathname) ? '/metals/clients' : '/clients';
}

export function customersCreateApi(pathname: string): string {
  return isMetalsCustomersPath(pathname) ? '/metals/clients' : '/clients';
}

export function customersUiBase(pathname: string): string {
  return isMetalsCustomersPath(pathname) ? '/metals/customers' : '/customers';
}
