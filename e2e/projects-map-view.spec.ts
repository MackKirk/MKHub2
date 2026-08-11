import { test, expect } from '@playwright/test';

test.describe('Projects Map View', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('user_token', 'test-token');
      (window as unknown as { google: unknown }).google = {
        maps: {
          Map: class {
            constructor(_el: HTMLElement, _opts: unknown) {}
            addListener() {
              return { remove: () => undefined };
            }
            getBounds() {
              return {
                getNorthEast: () => ({ lat: () => 54, lng: () => -122 }),
                getSouthWest: () => ({ lat: () => 49, lng: () => -128 }),
              };
            }
            getCenter() {
              return { toJSON: () => ({ lat: 53.7, lng: -127.6 }) };
            }
            getZoom() {
              return 6;
            }
            setCenter() {}
            setZoom() {}
            fitBounds() {}
          },
          Marker: class {
            constructor() {}
            setMap() {}
            addListener() {}
          },
          InfoWindow: class {
            setContent() {}
            setPosition() {}
            open() {}
            close() {}
            addListener() {
              return { remove: () => undefined };
            }
          },
          LatLngBounds: class {
            extend() {}
          },
          Size: class {},
          Point: class {},
          event: {
            addListener: () => ({ remove: () => undefined }),
            addListenerOnce: () => ({ remove: () => undefined }),
            removeListener: () => undefined,
            trigger: () => undefined,
          },
        },
      };
    });

    await page.route('**/projects/business/projects/map-points**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'p1',
              code: 'MK-001',
              name: 'Test Project',
              customer_name: 'Customer',
              address: 'Vancouver, BC',
              latitude: 49.28,
              longitude: -123.12,
              status: 'finished',
              division_names: ['Roof Maintenance'],
              project_admin: { id: 'u1', name: 'Admin' },
              start_date: '2026-01-01',
              end_date: '2026-01-02',
            },
          ],
          mapped_count: 1,
          unmapped_count: 0,
          total_matching: 1,
        }),
      });
    });
  });

  test('map toggle loads map view', async ({ page }) => {
    await page.goto('/projects?view=map');
    await expect(page.getByRole('button', { name: 'Map view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/mapped project/i)).toBeVisible({ timeout: 15_000 });
  });
});
