export interface NavItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  sub?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'pi pi-home', route: '/' },
  { key: 'invoice', label: 'Invoice', icon: 'pi pi-file', route: '/invoice' },
  {
    key: 'invoice-settings',
    label: 'Invoice settings',
    icon: 'pi pi-cog',
    route: '/invoice/settings',
    sub: true,
  },
  {
    key: 'donation-receipt',
    label: 'Donation Receipt',
    icon: 'pi pi-heart',
    route: '/donation-receipt',
  },
  {
    key: 'donation-receipt-settings',
    label: 'Receipt settings',
    icon: 'pi pi-cog',
    route: '/donation-receipt/settings',
    sub: true,
  },
  { key: 'instructor', label: 'Instructor Rent', icon: 'pi pi-users', route: '/instructor' },
];

/** Key of the most specific entry whose route is the path or a parent of it. */
export function activeNavKey(path: string, items: NavItem[] = NAV_ITEMS): string | null {
  let best: NavItem | null = null;
  for (const item of items) {
    const matches =
      item.route === '/' ? path === '/' : path === item.route || path.startsWith(`${item.route}/`);
    if (matches && (!best || item.route.length > best.route.length)) best = item;
  }
  return best?.key ?? null;
}
