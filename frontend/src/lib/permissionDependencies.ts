export function hasAnyProjectLineRead(permissions: Record<string, boolean>): boolean {
  return !!(
    permissions['business:projects:read'] ||
    permissions['business:construction:projects:read'] ||
    permissions['business:rm:projects:read']
  );
}

function hasConstructionLineRead(permissions: Record<string, boolean>): boolean {
  return !!(
    permissions['business:construction:projects:read'] ||
    permissions['business:construction:projects:write'] ||
    permissions['business:projects:read'] ||
    permissions['business:projects:write']
  );
}

function hasRepairsLineRead(permissions: Record<string, boolean>): boolean {
  return !!(
    permissions['business:rm:projects:read'] || permissions['business:rm:projects:write']
  );
}

function clearMembersWriteIfNoLineRead(perms: Record<string, boolean>): void {
  if (!hasAnyProjectLineRead(perms)) {
    perms['business:projects:members:write'] = false;
  }
  if (!hasConstructionLineRead(perms)) {
    perms['business:construction:projects:members:write'] = false;
  }
  if (!hasRepairsLineRead(perms)) {
    perms['business:rm:projects:members:write'] = false;
  }
}

/** Whether a permission checkbox can be turned on given current selection. */
export function canEnablePermission(
  permKey: string,
  permissions: Record<string, boolean>
): boolean {
  const has = (k: string) => !!permissions[k];

  if (
    permKey === 'hr:users:view:general' ||
    permKey === 'hr:users:view:timesheet' ||
    permKey === 'hr:users:view:permissions' ||
    permKey === 'hr:users:view:activity'
  ) {
    return has('hr:users:read');
  }
  if (permKey === 'hr:users:view:job:compensation') {
    return has('hr:users:read') && has('hr:users:view:general');
  }
  if (permKey === 'hr:users:write') {
    return has('hr:users:read');
  }
  if (permKey === 'hr:offboarding:read') {
    return has('hr:access');
  }
  if (permKey === 'hr:offboarding:write') {
    return has('hr:offboarding:read');
  }
  if (permKey === 'hr:attendance:write') {
    return has('hr:attendance:read');
  }
  if (permKey === 'hr:community:write') {
    return has('hr:community:read');
  }
  if (permKey === 'hr:timesheet:write') {
    return has('hr:timesheet:read');
  }
  if (permKey === 'hr:timesheet:approve') {
    return has('hr:timesheet:read');
  }
  if (permKey === 'business:projects:write') {
    return has('business:projects:read');
  }
  if (permKey === 'business:customers:write') {
    return has('business:customers:read');
  }
  if (permKey === 'inventory:suppliers:write') {
    return has('inventory:suppliers:read');
  }
  if (permKey === 'inventory:products:write') {
    return has('inventory:products:read');
  }
  if (
    permKey.startsWith('business:customers:') &&
    permKey.endsWith(':read') &&
    permKey !== 'business:customers:read'
  ) {
    return has('business:customers:read');
  }
  if (
    permKey.startsWith('business:customers:') &&
    permKey.endsWith(':write') &&
    permKey !== 'business:customers:write'
  ) {
    return has(permKey.replace(':write', ':read'));
  }
  if (
    permKey.startsWith('inventory:suppliers:') &&
    permKey.endsWith(':read') &&
    permKey !== 'inventory:suppliers:read'
  ) {
    return has('inventory:suppliers:read');
  }
  if (
    permKey.startsWith('inventory:suppliers:') &&
    permKey.endsWith(':write') &&
    permKey !== 'inventory:suppliers:write'
  ) {
    return has(permKey.replace(':write', ':read'));
  }
  if (
    permKey.startsWith('inventory:products:') &&
    permKey.endsWith(':read') &&
    permKey !== 'inventory:products:read'
  ) {
    return has('inventory:products:read');
  }
  if (
    permKey.startsWith('inventory:products:') &&
    permKey.endsWith(':write') &&
    permKey !== 'inventory:products:write'
  ) {
    return has(permKey.replace(':write', ':read'));
  }
  if (permKey === 'sales:quotations:write') {
    return has('sales:quotations:read');
  }
  if (permKey === 'hr:users:edit:general') {
    return has('hr:users:read') && has('hr:users:view:general');
  }
  if (permKey === 'hr:users:edit:timesheet') {
    return has('hr:users:read') && has('hr:users:view:timesheet');
  }
  if (permKey === 'hr:users:edit:permissions') {
    return has('hr:users:read') && has('hr:users:view:permissions');
  }
  if (permKey === 'business:construction:projects:write') {
    return has('business:construction:projects:read');
  }
  if (permKey === 'business:rm:projects:write') {
    return has('business:rm:projects:read');
  }
  if (permKey === 'business:construction:projects:read:all') {
    return has('business:construction:projects:read');
  }
  if (permKey === 'business:rm:projects:read:all') {
    return has('business:rm:projects:read');
  }
  if (permKey === 'business:projects:members:write') {
    return hasAnyProjectLineRead(permissions);
  }
  if (permKey === 'business:construction:projects:members:write') {
    return hasConstructionLineRead(permissions);
  }
  if (permKey === 'business:rm:projects:members:write') {
    return hasRepairsLineRead(permissions);
  }
  if (
    permKey.startsWith('business:construction:projects:') &&
    permKey.endsWith(':read') &&
    permKey !== 'business:construction:projects:read' &&
    !permKey.endsWith(':read:all')
  ) {
    return hasConstructionLineRead(permissions);
  }
  if (
    permKey.startsWith('business:rm:projects:') &&
    permKey.endsWith(':read') &&
    permKey !== 'business:rm:projects:read' &&
    !permKey.endsWith(':read:all')
  ) {
    return hasRepairsLineRead(permissions);
  }
  if (
    permKey.startsWith('business:construction:projects:') &&
    permKey.endsWith(':write') &&
    permKey !== 'business:construction:projects:write'
  ) {
    return has(permKey.replace(':write', ':read'));
  }
  if (
    permKey.startsWith('business:rm:projects:') &&
    permKey.endsWith(':write') &&
    permKey !== 'business:rm:projects:write'
  ) {
    return has(permKey.replace(':write', ':read'));
  }
  if (
    permKey.startsWith('business:projects:') &&
    permKey.endsWith(':read') &&
    permKey !== 'business:projects:read' &&
    !permKey.endsWith(':read:all')
  ) {
    return hasAnyProjectLineRead(permissions);
  }
  if (
    permKey.startsWith('business:projects:') &&
    permKey.endsWith(':write') &&
    permKey !== 'business:projects:write'
  ) {
    return has(permKey.replace(':write', ':read'));
  }
  if (permKey === 'fleet:vehicles:write') {
    return has('fleet:vehicles:read');
  }
  if (permKey === 'fleet:equipment:write') {
    return has('fleet:equipment:read');
  }
  if (permKey === 'company_cards:write') {
    return has('company_cards:read');
  }
  if (permKey === 'fleet:work_orders:write') {
    return has('fleet:work_orders:read');
  }
  if (permKey === 'fleet:inspections:write') {
    return has('fleet:inspections:read');
  }
  if (permKey === 'fleet:work_orders:assign') {
    return has('fleet:work_orders:read');
  }
  const fleetMainReadByPrefix: Record<string, string> = {
    'fleet:vehicles:': 'fleet:vehicles:read',
    'fleet:work_orders:': 'fleet:work_orders:read',
    'fleet:inspections:': 'fleet:inspections:read',
    'fleet:equipment:': 'fleet:equipment:read',
  };
  for (const [prefix, mainRead] of Object.entries(fleetMainReadByPrefix)) {
    if (permKey.startsWith(prefix) && permKey.endsWith(':read') && permKey !== mainRead) {
      return has(mainRead);
    }
    if (permKey.startsWith(prefix) && permKey.endsWith(':write') && permKey !== mainRead.replace(':read', ':write')) {
      return has(permKey.replace(':write', ':read'));
    }
  }
  return true;
}

/** Human-readable message when enabling a permission is blocked. */
export function permissionEnableBlockedMessage(permKey: string): string | null {
  if (permKey === 'business:construction:projects:read:all') {
    return 'Requires "View Projects & Opportunities (Production)" first';
  }
  if (permKey === 'business:rm:projects:read:all') {
    return 'Requires "View Projects & Opportunities (Repairs & Maintenance)" first';
  }
  if (permKey === 'business:projects:members:write') {
    return 'Requires at least one project view permission (legacy, Production, or R&M)';
  }
  if (permKey === 'business:construction:projects:write') {
    return 'Requires "View Projects & Opportunities (Production)" first';
  }
  if (permKey === 'business:rm:projects:write') {
    return 'Requires "View Projects & Opportunities (Repairs & Maintenance)" first';
  }
  if (permKey === 'business:projects:write') {
    return 'Requires "View Projects & Opportunities" first';
  }
  if (
    permKey.startsWith('business:projects:') &&
    permKey.endsWith(':read') &&
    permKey !== 'business:projects:read'
  ) {
    return 'Requires a project view permission first';
  }
  if (permKey === 'business:projects:reports:write') {
    return 'Requires "View Notes/History" first';
  }
  if (
    permKey.startsWith('business:customers:') &&
    permKey.endsWith(':write') &&
    permKey !== 'business:customers:write'
  ) {
    return 'Requires the corresponding customer view permission first';
  }
  if (
    permKey.startsWith('business:customers:') &&
    permKey.endsWith(':read') &&
    permKey !== 'business:customers:read'
  ) {
    return 'Requires "View Customers" first';
  }
  if (
    permKey.startsWith('inventory:suppliers:') &&
    permKey.endsWith(':write') &&
    permKey !== 'inventory:suppliers:write'
  ) {
    return 'Requires the corresponding supplier view permission first';
  }
  if (
    permKey.startsWith('inventory:suppliers:') &&
    permKey.endsWith(':read') &&
    permKey !== 'inventory:suppliers:read'
  ) {
    return 'Requires "View Suppliers" first';
  }
  if (
    permKey.startsWith('inventory:products:') &&
    permKey.endsWith(':write') &&
    permKey !== 'inventory:products:write'
  ) {
    return 'Requires the corresponding product view permission first';
  }
  if (
    permKey.startsWith('inventory:products:') &&
    permKey.endsWith(':read') &&
    permKey !== 'inventory:products:read'
  ) {
    return 'Requires "View Products" first';
  }
  if (
    permKey.startsWith('business:projects:') &&
    permKey.endsWith(':write') &&
    permKey !== 'business:projects:write'
  ) {
    return 'Requires the corresponding view permission first';
  }
  return 'Required permissions must be enabled first';
}

/** When unchecking a permission, clear dependent permissions. */
export function applyPermissionUncheckCascade(
  uncheckedKey: string,
  perms: Record<string, boolean>
): Record<string, boolean> {
  const newPerms = { ...perms };

  if (uncheckedKey === 'fleet:access') {
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('fleet:') && k !== 'fleet:access' && !k.startsWith('fleet:equipment:')) {
        newPerms[k] = false;
      }
    });
  } else if (uncheckedKey === 'company_assets:access') {
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('fleet:equipment:') || k.startsWith('company_cards:')) {
        newPerms[k] = false;
      }
    });
  } else if (uncheckedKey === 'fleet:vehicles:read') {
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('fleet:vehicles:') && k !== 'fleet:vehicles:read') {
        newPerms[k] = false;
      }
    });
  } else if (uncheckedKey === 'fleet:work_orders:read') {
    newPerms['fleet:work_orders:write'] = false;
    newPerms['fleet:work_orders:assign'] = false;
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('fleet:work_orders:') && k !== 'fleet:work_orders:read') {
        newPerms[k] = false;
      }
    });
  } else if (uncheckedKey === 'fleet:inspections:read') {
    newPerms['fleet:inspections:write'] = false;
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('fleet:inspections:') && k !== 'fleet:inspections:read') {
        newPerms[k] = false;
      }
    });
  } else if (uncheckedKey === 'fleet:equipment:read') {
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('fleet:equipment:') && k !== 'fleet:equipment:read') {
        newPerms[k] = false;
      }
    });
  } else if (uncheckedKey === 'company_cards:read') {
    newPerms['company_cards:write'] = false;
  } else if (
    uncheckedKey.startsWith('fleet:vehicles:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'fleet:vehicles:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (
    uncheckedKey.startsWith('fleet:work_orders:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'fleet:work_orders:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (
    uncheckedKey.startsWith('fleet:inspections:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'fleet:inspections:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (
    uncheckedKey.startsWith('fleet:equipment:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'fleet:equipment:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (uncheckedKey === 'hr:access') {
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('hr:') && k !== 'hr:access') {
        newPerms[k] = false;
      }
    });
  } else if (uncheckedKey === 'hr:attendance:read') {
    newPerms['hr:attendance:write'] = false;
  } else if (uncheckedKey === 'hr:community:read') {
    newPerms['hr:community:write'] = false;
  } else if (uncheckedKey === 'hr:timesheet:read') {
    newPerms['hr:timesheet:write'] = false;
    newPerms['hr:timesheet:approve'] = false;
  } else if (uncheckedKey === 'hr:offboarding:read') {
    newPerms['hr:offboarding:write'] = false;
  } else if (uncheckedKey === 'hr:users:view:general') {
    newPerms['hr:users:edit:general'] = false;
    newPerms['hr:users:view:job:compensation'] = false;
  } else if (uncheckedKey === 'hr:users:view:timesheet') {
    newPerms['hr:users:edit:timesheet'] = false;
  } else if (uncheckedKey === 'hr:users:view:permissions') {
    newPerms['hr:users:edit:permissions'] = false;
  } else if (uncheckedKey === 'hr:users:read') {
    newPerms['hr:users:write'] = false;
    newPerms['hr:users:view:general'] = false;
    newPerms['hr:users:view:job:compensation'] = false;
    newPerms['hr:users:view:timesheet'] = false;
    newPerms['hr:users:view:permissions'] = false;
    newPerms['hr:users:view:activity'] = false;
    newPerms['hr:users:edit:general'] = false;
    newPerms['hr:users:edit:timesheet'] = false;
    newPerms['hr:users:edit:permissions'] = false;
  } else if (uncheckedKey === 'business:customers:read') {
    newPerms['business:customers:write'] = false;
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('business:customers:') && k !== 'business:customers:read') {
        newPerms[k] = false;
      }
    });
  } else if (
    uncheckedKey.startsWith('business:customers:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'business:customers:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (uncheckedKey === 'inventory:suppliers:read') {
    newPerms['inventory:suppliers:write'] = false;
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('inventory:suppliers:') && k !== 'inventory:suppliers:read') {
        newPerms[k] = false;
      }
    });
  } else if (
    uncheckedKey.startsWith('inventory:suppliers:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'inventory:suppliers:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (uncheckedKey === 'inventory:products:read') {
    newPerms['inventory:products:write'] = false;
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('inventory:products:') && k !== 'inventory:products:read') {
        newPerms[k] = false;
      }
    });
  } else if (
    uncheckedKey.startsWith('inventory:products:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'inventory:products:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (uncheckedKey === 'sales:quotations:read') {
    newPerms['sales:quotations:write'] = false;
  } else if (uncheckedKey === 'business:construction:projects:read') {
    newPerms['business:construction:projects:write'] = false;
    newPerms['business:construction:projects:read:all'] = false;
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('business:construction:projects:') && k !== 'business:construction:projects:read') {
        newPerms[k] = false;
      }
    });
    clearMembersWriteIfNoLineRead(newPerms);
  } else if (uncheckedKey === 'business:rm:projects:read') {
    newPerms['business:rm:projects:write'] = false;
    newPerms['business:rm:projects:read:all'] = false;
    Object.keys(newPerms).forEach((k) => {
      if (k.startsWith('business:rm:projects:') && k !== 'business:rm:projects:read') {
        newPerms[k] = false;
      }
    });
    clearMembersWriteIfNoLineRead(newPerms);
  } else if (uncheckedKey === 'business:projects:read') {
    newPerms['business:projects:write'] = false;
    newPerms['business:projects:reports:read'] = false;
    newPerms['business:projects:workload:read'] = false;
    newPerms['business:projects:timesheet:read'] = false;
    newPerms['business:projects:files:read'] = false;
    newPerms['business:projects:documents:read'] = false;
    newPerms['business:projects:documents:write'] = false;
    newPerms['business:projects:proposal:read'] = false;
    newPerms['business:projects:estimate:read'] = false;
    newPerms['business:projects:orders:read'] = false;
    newPerms['business:projects:safety:read'] = false;
    clearMembersWriteIfNoLineRead(newPerms);
  } else if (uncheckedKey === 'business:projects:write') {
    newPerms['business:projects:reports:write'] = false;
    newPerms['business:projects:workload:write'] = false;
    newPerms['business:projects:timesheet:write'] = false;
    newPerms['business:projects:files:write'] = false;
    newPerms['business:projects:documents:write'] = false;
    newPerms['business:projects:proposal:write'] = false;
    newPerms['business:projects:estimate:write'] = false;
    newPerms['business:projects:orders:write'] = false;
    newPerms['business:projects:safety:write'] = false;
  } else if (
    uncheckedKey.startsWith('business:projects:') &&
    uncheckedKey.endsWith(':read') &&
    uncheckedKey !== 'business:projects:read'
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  } else if (
    (uncheckedKey.startsWith('business:construction:projects:') ||
      uncheckedKey.startsWith('business:rm:projects:')) &&
    uncheckedKey.endsWith(':read') &&
    !uncheckedKey.endsWith(':read:all')
  ) {
    newPerms[uncheckedKey.replace(':read', ':write')] = false;
  }

  return newPerms;
}

/** Set variant for permission templates in System Settings. */
export function applyPermissionUncheckCascadeSet(
  uncheckedKey: string,
  current: Set<string>
): Set<string> {
  const record = Object.fromEntries([...current].map((k) => [k, true]));
  const next = applyPermissionUncheckCascade(uncheckedKey, record);
  return new Set(Object.keys(next).filter((k) => next[k]));
}

export function canEnablePermissionSet(permKey: string, selectedKeys: Set<string>): boolean {
  const permissions = Object.fromEntries([...selectedKeys].map((k) => [k, true]));
  return canEnablePermission(permKey, permissions);
}
