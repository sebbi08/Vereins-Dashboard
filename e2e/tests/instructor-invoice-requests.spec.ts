import { BACKEND_URL } from './helpers';

async function createInstructor(name: string): Promise<number> {
  const res = await fetch(`${BACKEND_URL}/api/instructor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientData: {
        name,
        street: 'Hauptstr. 1',
        city: '12345 Berlin',
        email: null,
        salutation: null,
      },
      hourlyRateCents: 1200,
      months: 6,
      timeBlocks: [],
    }),
  });
  if (!res.ok) throw new Error(`Creating the instructor failed (${res.status})`);
  return ((await res.json()) as { id: number }).id;
}

async function requestedMonths(year: number, instructorId: number): Promise<string[]> {
  const res = await fetch(`${BACKEND_URL}/api/instructor/invoice-requests?year=${year}`);
  if (!res.ok) throw new Error(`Loading the invoice requests failed (${res.status})`);
  const rows = (await res.json()) as { instructorId: number; month: string }[];
  return rows.filter((r) => r.instructorId === instructorId).map((r) => r.month);
}

describe('Instructor invoice requests', () => {
  it('keeps a ticked month after reloading the page', async () => {
    const id = await createInstructor('Erika E2E');
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const selector = `[data-testid="request-${id}-${month}"]`;

    await browser.url('/instructor');
    const cell = await $(selector);
    await expect(cell).toBeClickable();
    await expect(cell).toHaveAttribute('aria-pressed', 'false');

    await cell.click();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await browser.waitUntil(
      async () => (await requestedMonths(now.getFullYear(), id)).includes(month),
      { timeout: 5000, timeoutMsg: 'the invoice request was not saved' },
    );

    await browser.refresh();
    await expect($(selector)).toHaveAttribute('aria-pressed', 'true');
  });
});
