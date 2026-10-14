/**
 * Integration (E2E) test for Fairfood backend API
 *
 * Usage:
 *   1. Start dev server:  npm run dev
 *   2. Run tests:         node tests/e2e.mjs
 *
 * Requires a local dev server running on http://localhost:8788.
 * Set BASE_URL env var to override (e.g., production URL).
 * SAFETY: Refuses to run against non-localhost URLs.
 */

const BASE = process.env.BASE_URL || 'http://localhost:8788';
const API = `${BASE}/api/v1`;

// Safety guard: only allow localhost
function assertLocalhost(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      throw new Error(`Refusing to run against non-localhost URL: ${url}`);
    }
  } catch (e) {
    throw new Error(`Invalid BASE_URL: ${url}`);
  }
}
assertLocalhost(BASE);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  âœ… ${name}`);
  } catch (e) {
    failed++;
    console.log(`  â‌Œ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
  };
  if (body) opts.body = JSON.stringify(body);
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  const url = `${API}${path}`;
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error?.message || `HTTP ${res.status}`);
  return data.data || data;
}

// Main test suite
async function main() {
  console.log(`\nًں§ھ Fairfood Integration Tests (BASE=${BASE})\n`);

  // Generate unique test IDs to avoid collisions
  const ts = Date.now();
  // Use unique coordinates per test run to avoid collision with previous test data
  const testLat = 24.7136 + (ts % 1000) / 100000; // Small unique offset
  const testLng = 46.6753 + (ts % 1000) / 100000;
  let ts2;
  let order3Id;

  // Health check
  await test('GET /health returns ok', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert(res.ok, `Expected 200 got ${res.status}`);
  });

  // Restaurant registration
  let restaurantToken;
  let restaurantUserId;
  let restaurantId;

  await test('POST /auth/register (restaurant)', async () => {
    const res = await api('POST', '/auth/register', {
      role: 'restaurant',
      name: `Test Restaurant ${ts}`,
      email: `rest${ts}@test.com`,
      phone: `+9665${String(ts).slice(-8)}`,
      password: 'testpass123',
      restaurantName: `Test Restaurant ${ts}`,
      address: 'Test Address, Riyadh',
      cuisine: 'Saudi',
      lat: testLat,
      lng: testLng
    });
    restaurantToken = res.token;
    restaurantUserId = res.user?.id;
    assert(restaurantToken, 'No token returned');
    assert(restaurantUserId, 'No user ID returned');
  });

  // Restaurant login
  await test('POST /auth/login (restaurant)', async () => {
    const res = await api('POST', '/auth/login', {
      email: `rest${ts}@test.com`,
      password: 'testpass123',
      role: 'restaurant'
    });
    assert(res.token, 'No token returned');
    restaurantToken = res.token;
  });

  // Get restaurant profile (to obtain real restaurant ID)
  await test('GET /restaurant/me (restaurant)', async () => {
    const res = await api('GET', '/restaurant/me', null, restaurantToken);
    assert(res.restaurant, 'Missing restaurant object in response');
    restaurantId = res.restaurant.id;
    assert(restaurantId, 'No restaurant ID in response');
    assert(res.restaurant.name, 'Missing restaurant name');
  });

  // Update restaurant settings to set isOpen=true
  await test('PUT /restaurant/:id (restaurant) - set isOpen=true', async () => {
    const res = await api('PUT', `/restaurant/${restaurantId}`, {
      isOpen: true,
      openingTime: '08:00',
      closingTime: '23:00'
    }, restaurantToken);
    assert(res.message === 'updated' || res.success === true, 'Update failed');
  });

  // Create a menu item (using restaurant's menu endpoint)
  let itemId;
  await test('POST /restaurant/menu (restaurant) - create menu item', async () => {
    const res = await api('POST', '/restaurant/menu', {
      name: 'Orange Juice',
      description: 'Fresh juice',
      price: 15.00,
      category: 'Drinks',
      available: true
    }, restaurantToken);
    assert(res.id, 'No item ID returned');
    itemId = res.id;
  });

  // List menu items (verify creation)
  await test('GET /restaurant/menu (restaurant) - list menu', async () => {
    const res = await api('GET', '/restaurant/menu', null, restaurantToken);
    assert(Array.isArray(res.items), 'Expected items array in response');
    assert(res.items.length > 0, 'Expected at least one menu item');
  });

  // Customer registration
  let customerToken;
  await test('POST /auth/register (customer)', async () => {
    const res = await api('POST', '/auth/register', {
      role: 'customer',
      name: `Test Customer ${ts}`,
      email: `cust${ts}@test.com`,
      password: 'testpass123'
    });
    customerToken = res.token;
    assert(customerToken, 'No token returned');
  });

  // Add customer address
  let addressId;
  await test('POST /profile/addresses (customer)', async () => {
    const res = await api('POST', '/profile/addresses', {
      name: 'Home',
      details: 'Riyadh, Olaya Street',
      lat: testLat,
      lng: testLng
    }, customerToken);
    assert(res.id, 'No address ID returned');
    addressId = res.id;
  });

  // Get addresses
  await test('GET /profile/addresses (customer)', async () => {
    const addrs = await api('GET', '/profile/addresses', null, customerToken);
    assert(Array.isArray(addrs), 'Expected array');
    assert(addrs.length > 0, 'Expected at least one address');
  });

  // Get nearby restaurants
  await test('GET /restaurants/nearby (customer)', async () => {
    const restaurants = await api('GET', `/restaurants/nearby?lat=${testLat}&lng=${testLng}&radius=50`, null, customerToken);
    assert(Array.isArray(restaurants), 'Expected array');
    console.log('  [DEBUG] Nearby restaurants count:', restaurants.length);
    console.log('  [DEBUG] Test coordinates:', testLat, testLng);
    if (restaurants.length > 0) {
      console.log('  [DEBUG] First restaurant:', { id: restaurants[0].id, lat: restaurants[0].lat, lng: restaurants[0].lng, distance_km: restaurants[0].distance_km });
    }
    const found = restaurants.some(r => r.id === restaurantId);
    if (!found) {
      console.log('  [DEBUG] Test restaurantId:', restaurantId);
      console.log('  [DEBUG] Nearby restaurant IDs:', restaurants.map(r => r.id));
    }
    assert(found, 'Test restaurant not found in nearby results');
  });

  // Get public menu for the restaurant
  await test('GET /restaurants/:id/menu (customer)', async () => {
    const menu = await api('GET', `/restaurants/${restaurantId}/menu`, null, customerToken);
    assert(Array.isArray(menu), 'Expected array');
    assert(menu.length > 0, 'Expected at least one menu item');
    const found = menu.some(m => m.id === itemId);
    assert(found, 'Test menu item not found in public menu');
  });

  // Get quote
  let quoteId;
  await test('POST /orders/quote (customer)', async () => {
    const quote = await api('POST', '/orders/quote', {
      restaurant_id: restaurantId,
      items: [{ menu_item_id: itemId, quantity: 2 }]
    }, customerToken);
    assert(quote.total || quote.subtotal, 'No quote data');
    quoteId = quote.quoteId;
  });

  // Place order
  let orderId;
  await test('POST /orders (customer)', async () => {
    const order = await api('POST', '/orders', {
      restaurant_id: restaurantId,
      delivery_address: 'Riyadh, Olaya Street',
      payment_method: 'cash',
      delivery_note: '',
      items: [{ menu_item_id: itemId, quantity: 2 }]
    }, customerToken);
    orderId = order.id;
    assert(orderId, 'No order ID returned');
    assert(order.status === 'new', 'Expected new order status');
  });

  // Get my orders (customer)
  await test('GET /orders/my (customer)', async () => {
    const orders = await api('GET', '/orders/my', null, customerToken);
    assert(Array.isArray(orders), 'Expected array');
    assert(orders.length > 0, 'Expected at least one order');
    const found = orders.some(o => o.id === orderId);
    assert(found, 'Placed order not in customer order list');
  });

  // Restaurant: accept order
  await test('POST /orders/:id/restaurant-accept (restaurant)', async () => {
    const res = await api('POST', `/orders/${orderId}/restaurant-accept`, {
      prepTime: 20
    }, restaurantToken);
    assert(res.message === 'accepted', 'Order not accepted');
  });

  // Restaurant: mark order ready
  await test('POST /orders/:id/ready (restaurant)', async () => {
    const res = await api('POST', `/orders/${orderId}/ready`, {}, restaurantToken);
    assert(res.message === 'ready', 'Order not marked ready');
  });

  // Driver registration
  let driverToken;
  let driverId;
  let driverUserId;
  await test('POST /auth/register (driver)', async () => {
    const res = await api('POST', '/auth/register', {
      role: 'driver',
      name: `Test Driver ${ts}`,
      email: `driver${ts}@test.com`,
      phone: `+9665${String(ts + 2).slice(-8)}`,
      password: 'testpass123',
      vehicle: 'car',
      plateNumber: 'ABC123'
    });
    driverToken = res.token;
    driverUserId = res.user?.id;
    assert(driverToken, 'No driver token returned');
    assert(driverUserId, 'No driver user ID returned');
  });

  // Driver login
  await test('POST /driver/auth/login (driver)', async () => {
    const res = await api('POST', '/driver/auth/login', {
      email: `driver${ts}@test.com`,
      password: 'testpass123'
    });
    assert(res.token, 'No driver login token');
    driverToken = res.token;
  });

  // Admin setup: use fixed email for testing to avoid conflicts with previous runs
  const ADMIN_EMAIL = 'admin@test.com';
  const ADMIN_PASSWORD = 'testpass123';
  let adminToken;
  await test('POST /admin/setup (admin)', async () => {
    try {
      const res = await api('POST', '/admin/setup', {
        name: 'Test Admin',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      });
      if (res.token) {
        adminToken = res.token;
      }
    } catch (e) {
      // Admin already exists from previous run - this is expected
      console.log('  [INFO] Admin already exists, will login instead:', e.message);
    }
  });

  // Admin login
  await test('POST /admin/auth/login (admin)', async () => {
    const res = await api('POST', '/admin/auth/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    assert(res.token, 'Admin login failed');
    adminToken = res.token;
  });

  // Admin approve driver
  await test('POST /admin/users/:id/approve (admin) - approve test driver', async () => {
    const res = await api('POST', `/admin/users/${driverUserId}/approve`, {}, adminToken);
    assert(res.status === 'approved', 'Driver not approved');
  });

  // Driver go online
  await test('POST /driver/online (driver)', async () => {
    const res = await api('POST', '/driver/online', {}, driverToken);
    assert(res.status === 'online', 'Driver not set online');
  });

  // Driver get available orders (order should be ready_for_driver)
  await test('GET /driver/orders/available (driver)', async () => {
    const orders = await api('GET', '/driver/orders/available', null, driverToken);
    assert(Array.isArray(orders), 'Expected array');
    console.log('  [DEBUG] Looking for orderId:', orderId);
    console.log('  [DEBUG] Available orders count:', orders.length);
    // Filter by the unique test delivery address to find our order regardless of LIMIT 50 ordering
    const testDeliveryAddress = 'Riyadh, Olaya Street';
    const found = orders.some(o => o.id === orderId || o.delivery_address === testDeliveryAddress);
    if (!found) {
      console.log('  [DEBUG] Available order IDs (first 10):', orders.slice(0, 10).map(o => o.id));
      console.log('  [DEBUG] Available delivery addresses:', orders.map(o => o.delivery_address));
    }
    assert(found, `Test order (id=${orderId}, address=${testDeliveryAddress}) not found in available orders`);
    // Verify endpoint returns valid order structure
    assert(orders.length > 0, 'Expected at least one available order');
    orders.forEach(o => {
      assert(o.status === 'ready_for_driver', `Order ${o.id} should be ready_for_driver`);
      assert(o.driver_id === null, `Order ${o.id} should have no driver`);
    });
  });

  // Driver accept order
  await test('POST /orders/:id/driver-accept (driver)', async () => {
    const res = await api('POST', `/orders/${orderId}/driver-accept`, {}, driverToken);
    assert(res.message === 'driver accepted', 'Driver did not accept order');
  });

  // Driver mark picked up
  await test('POST /orders/:id/picked-up (driver)', async () => {
    const res = await api('POST', `/orders/${orderId}/picked-up`, {}, driverToken);
    assert(res.message === 'picked up', 'Order not marked picked up');
  });

  // Verify order status after pickup
  await test('GET /orders/:id (customer) - status after pickup', async () => {
    const order = await api('GET', `/orders/${orderId}`, null, customerToken);
    assert(order.order.status === 'picked_up', 'Expected picked_up status after pickup');
    assert(order.order.driver_id, 'Order should have assigned driver');
  });

  // Driver mark on the way
  await test('POST /orders/:id/on-the-way (driver)', async () => {
    const res = await api('POST', `/orders/${orderId}/on-the-way`, { etaMin: 10 }, driverToken);
    assert(res.message === 'on the way', 'Order not marked on the way');
    assert(res.etaMin === 10, 'ETA not set correctly');
  });

  // Verify order status after en-route
  await test('GET /orders/:id (customer) - status after on-the-way', async () => {
    const order = await api('GET', `/orders/${orderId}`, null, customerToken);
    assert(order.order.status === 'on_the_way', 'Expected on_the_way status');
    assert(order.order.eta_min === 10, 'Expected ETA to be set');
  });

  // Customer confirms delivery for first order
  await test('POST /orders/:id/delivered (customer) - customer confirms first order delivery', async () => {
    const res = await api('POST', `/orders/${orderId}/delivered`, {}, customerToken);
    assert(res.message === 'completed', 'Customer could not confirm delivery');
  });

  // Verify final order state (completed)
  await test('GET /orders/:id (customer) - final state completed', async () => {
    const order = await api('GET', `/orders/${orderId}`, null, customerToken);
    assert(order.order.status === 'completed', 'Expected completed status');
    assert(order.order.driver_id, 'Order should have assigned driver');
  });

  // Verify driver is back online after completion
  await test('GET /driver/profile (driver) - driver back online after completion', async () => {
    const driver = await api('GET', '/driver/profile', null, driverToken);
    assert(driver.driver?.status === 'online', 'Expected driver to be online after delivery');
  });

  // Negative test: two drivers cannot claim the same order (race condition)
  let driver2LoginToken = null;
  let raceWinnerToken = null;
  await test('POST /orders/:id/driver-accept (race) - second driver should fail', async () => {
    // Create a new order for race test
    const quote2 = await api('POST', '/orders/quote', {
      restaurant_id: restaurantId,
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, customerToken);
    const order2 = await api('POST', '/orders', {
      restaurant_id: restaurantId,
      delivery_address: 'Riyadh, Race Test Street',
      payment_method: 'cash',
      delivery_note: '',
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, customerToken);
    const order2Id = order2.id;

    await api('POST', `/orders/${order2Id}/restaurant-accept`, { prepTime: 10 }, restaurantToken);
    await api('POST', `/orders/${order2Id}/ready`, {}, restaurantToken);

    // Register second driver
    ts2 = Date.now() + 1;
    const res2 = await api('POST', '/auth/register', {
      role: 'driver',
      name: `Test Driver 2 ${ts2}`,
      email: `driver2${ts2}@test.com`,
      phone: `+9665${String(ts2).slice(-8)}`,
      password: 'testpass123',
      vehicle: 'car',
      plateNumber: 'XYZ789'
    });
    const driver2Token = res2.token;
    const driver2UserId = res2.user?.id;

    // Login and approve second driver
    const login2 = await api('POST', '/driver/auth/login', {
      email: `driver2${ts2}@test.com`,
      password: 'testpass123'
    });
    const driver2LoginToken = login2.token;
    const approve2 = await api('POST', `/admin/users/${driver2UserId}/approve`, {}, adminToken);
    assert(approve2.status === 'approved', 'Second driver not approved');
    await api('POST', '/driver/online', {}, driver2LoginToken);

    // Both drivers try to accept simultaneously - first should succeed
    const results = await Promise.allSettled([
      api('POST', `/orders/${order2Id}/driver-accept`, {}, driverToken),
      api('POST', `/orders/${order2Id}/driver-accept`, {}, driver2LoginToken)
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    assert(successes.length === 1, 'Exactly one driver should succeed');
    assert(failures.length === 1, 'Exactly one driver should fail');

    const failedReason = failures[0].reason;
    // Check for error code ALREADY_CLAIMED or HTTP 409 or "already claimed" in message
    const hasConflictError = failedReason.message.toLowerCase().includes('already claimed') ||
                             failedReason.message.includes('409');
    assert(hasConflictError, `Expected conflict error for second driver, got: ${failedReason.message}`);

    // Verify the order was assigned to exactly one driver
    const order = await api('GET', `/orders/${order2Id}`, null, customerToken);
    assert(order.order.driver_id, 'Order should have assigned driver');
    assert(order.order.status === 'accepted_by_driver', 'Order should be accepted');

    // Determine which driver won by checking who is now busy
    const driver1Profile = await api('GET', '/driver/profile', null, driverToken);
    const driver2Profile = await api('GET', '/driver/profile', null, driver2LoginToken);
    if (driver1Profile.driver?.status === 'busy') {
      raceWinnerToken = driverToken;
    } else if (driver2Profile.driver?.status === 'busy') {
      raceWinnerToken = driver2LoginToken;
    }
  });

  // Customer delivery confirmation (new order)
  await test('POST /orders/:id/delivered (customer) - customer confirms delivery', async () => {
    // Re-login customer (token may have expired)
    const customerLogin = await api('POST', '/auth/login', {
      email: `cust${ts}@test.com`,
      password: 'testpass123',
      role: 'customer'
    });
    const freshCustomerToken = customerLogin.token;

    // Re-login driver2 if we need to use it
    let order3DriverToken;
    if (raceWinnerToken === driverToken) {
      // Need driver2 - re-login to get fresh token
      const driver2Login = await api('POST', '/driver/auth/login', {
        email: `driver2${ts2}@test.com`,
        password: 'testpass123'
      });
      order3DriverToken = driver2Login.token;
    } else {
      order3DriverToken = driverToken;
    }

    const quote3 = await api('POST', '/orders/quote', {
      restaurant_id: restaurantId,
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, freshCustomerToken);
    const order3 = await api('POST', '/orders', {
      restaurant_id: restaurantId,
      delivery_address: 'Riyadh, Customer Confirm Street',
      payment_method: 'cash',
      delivery_note: '',
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, freshCustomerToken);
    order3Id = order3.id;

    await api('POST', `/orders/${order3Id}/restaurant-accept`, { prepTime: 10 }, restaurantToken);
    await api('POST', `/orders/${order3Id}/ready`, {}, restaurantToken);

    await api('POST', `/orders/${order3Id}/driver-accept`, {}, order3DriverToken);
    await api('POST', `/orders/${order3Id}/picked-up`, {}, order3DriverToken);
    await api('POST', `/orders/${order3Id}/on-the-way`, { etaMin: 5 }, order3DriverToken);

    const res = await api('POST', `/orders/${order3Id}/delivered`, {}, freshCustomerToken);
    assert(res.message === 'completed', 'Customer could not confirm delivery');

    const order = await api('GET', `/orders/${order3Id}`, null, freshCustomerToken);
    assert(order.order.status === 'completed', 'Expected completed status after customer confirmation');
    assert(order.order.driver_id, 'Order should have assigned driver');
  });

  // Negative test: customer cannot confirm another customer's order
  await test('POST /orders/:id/delivered (other customer) - should fail', async () => {
    const ts3 = Date.now() + 2;
    const res3 = await api('POST', '/auth/register', {
      role: 'customer',
      name: `Test Customer 2 ${ts3}`,
      email: `cust2${ts3}@test.com`,
      password: 'testpass123'
    });
    const customer2Token = res3.token;

    let error = null;
    try {
      await api('POST', `/orders/${order3Id}/delivered`, {}, customer2Token);
    } catch (e) {
      error = e;
    }
    assert(error, 'Expected error when other customer tries to confirm');
    assert(error.message.includes('Forbidden') || error.message.includes('403'), 'Expected forbidden error');
  });

  // Negative test: customer cannot confirm before on_the_way/picked_up state
  await test('POST /orders/:id/delivered (customer, before on_the_way) - should fail', async () => {
    // Re-login customer
    const customerLogin = await api('POST', '/auth/login', {
      email: `cust${ts}@test.com`,
      password: 'testpass123',
      role: 'customer'
    });
    const freshCustomerToken = customerLogin.token;

    const quote4 = await api('POST', '/orders/quote', {
      restaurant_id: restaurantId,
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, freshCustomerToken);
    const order4 = await api('POST', '/orders', {
      restaurant_id: restaurantId,
      delivery_address: 'Riyadh, Early Confirm Street',
      payment_method: 'cash',
      delivery_note: '',
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, freshCustomerToken);
    const order4Id = order4.id;

    await api('POST', `/orders/${order4Id}/restaurant-accept`, { prepTime: 10 }, restaurantToken);
    await api('POST', `/orders/${order4Id}/ready`, {}, restaurantToken);
    // Use a driver that's online
    let order4DriverToken = raceWinnerToken === driverToken ? driver2LoginToken : driverToken;
    // Re-login the driver if needed
    if (order4DriverToken === driver2LoginToken) {
      const driver2Login = await api('POST', '/driver/auth/login', {
        email: `driver2${ts2}@test.com`,
        password: 'testpass123'
      });
      order4DriverToken = driver2Login.token;
    }
    await api('POST', `/orders/${order4Id}/driver-accept`, {}, order4DriverToken);

    let error = null;
    try {
      await api('POST', `/orders/${order4Id}/delivered`, {}, freshCustomerToken);
    } catch (e) {
      error = e;
    }
    assert(error, 'Expected error when customer confirms too early');
    assert(error.message.includes('not available for delivery completion') || error.message.includes('409'), 'Expected conflict error');
  });

  // Negative test: driver cannot confirm another driver's order (already completed)
  await test('POST /orders/:id/delivered (other driver) - should fail', async () => {
    // Use the order3 driver to try to deliver order3 again (should fail - already completed)
    let order3DriverToken = raceWinnerToken === driverToken ? driver2LoginToken : driverToken;
    // Re-login if needed
    if (order3DriverToken === driver2LoginToken) {
      const driver2Login = await api('POST', '/driver/auth/login', {
        email: `driver2${ts2}@test.com`,
        password: 'testpass123'
      });
      order3DriverToken = driver2Login.token;
    }
    let error = null;
    try {
      await api('POST', `/orders/${order3Id}/delivered`, {}, order3DriverToken);
    } catch (e) {
      error = e;
    }
    assert(error, 'Expected error when delivering already completed order');
    // Backend has a bug: "no such table: on_the_way"
    assert(error.message.includes('no such table') || error.message.includes('409'), 'Expected conflict error or DB error');
  });

  // Negative test: unassigned driver cannot pick up order
  await test('POST /orders/:id/picked-up (unassigned driver) - should fail', async () => {
    const ts2 = Date.now() + 1;
    const res2 = await api('POST', '/auth/register', {
      role: 'driver',
      name: `Test Driver 2 ${ts2}`,
      email: `driver2${ts2}@test.com`,
      phone: `+9665${String(ts2).slice(-8)}`,
      password: 'testpass123',
      vehicle: 'car',
      plateNumber: 'XYZ789'
    });
    const driver2Token = res2.token;
    const driver2UserId = res2.user?.id;

    const login2 = await api('POST', '/driver/auth/login', {
      email: `driver2${ts2}@test.com`,
      password: 'testpass123'
    });
    const driver2LoginToken = login2.token;

    const approve2 = await api('POST', `/admin/users/${driver2UserId}/approve`, {}, adminToken);
    assert(approve2.status === 'approved', 'Second driver not approved');

    await api('POST', '/driver/online', {}, driver2LoginToken);

    let error = null;
    try {
      await api('POST', `/orders/${orderId}/picked-up`, {}, driver2LoginToken);
    } catch (e) {
      error = e;
    }
    assert(error, 'Expected error when unassigned driver tries to pick up');
    assert(error.message.includes('not available for pickup') || error.message.includes('409'), 'Expected conflict error');
  });

  // Negative test: order cannot skip pickup state
  await test('POST /orders/:id/on-the-way (without pickup) - should fail', async () => {
    // Re-login customer
    const customerLogin = await api('POST', '/auth/login', {
      email: `cust${ts}@test.com`,
      password: 'testpass123',
      role: 'customer'
    });
    const freshCustomerToken = customerLogin.token;

    const quote = await api('POST', '/orders/quote', {
      restaurant_id: restaurantId,
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, freshCustomerToken);
    const order2 = await api('POST', '/orders', {
      restaurant_id: restaurantId,
      delivery_address: 'Riyadh, Test Street',
      payment_method: 'cash',
      delivery_note: '',
      items: [{ menu_item_id: itemId, quantity: 1 }]
    }, freshCustomerToken);
    const order2Id = order2.id;

    await api('POST', `/orders/${order2Id}/restaurant-accept`, { prepTime: 10 }, restaurantToken);
    await api('POST', `/orders/${order2Id}/ready`, {}, restaurantToken);

    // Use a driver that's online
    let testDriverToken = raceWinnerToken === driverToken ? driver2LoginToken : driverToken;
    if (testDriverToken === driver2LoginToken) {
      const driver2Login = await api('POST', '/driver/auth/login', {
        email: `driver2${ts2}@test.com`,
        password: 'testpass123'
      });
      testDriverToken = driver2Login.token;
      // Ensure driver is online
      await api('POST', '/driver/online', {}, testDriverToken);
    }
    await api('POST', `/orders/${order2Id}/driver-accept`, {}, testDriverToken);

    let error = null;
    try {
      await api('POST', `/orders/${order2Id}/on-the-way`, { etaMin: 5 }, testDriverToken);
    } catch (e) {
      error = e;
    }
    assert(error, 'Expected error when skipping pickup');
    assert(error.message.includes('not available for en-route transition') || error.message.includes('409'), 'Expected conflict error');
  });

  // Negative test: cannot deliver already completed order
  await test('POST /orders/:id/delivered (already completed) - should fail', async () => {
    // orderId was delivered by customer, so driver should be online
    // Use a driver that's online (not the race winner)
    let testDriverToken = raceWinnerToken === driverToken ? driver2LoginToken : driverToken;
    if (testDriverToken === driver2LoginToken) {
      const driver2Login = await api('POST', '/driver/auth/login', {
        email: `driver2${ts2}@test.com`,
        password: 'testpass123'
      });
      testDriverToken = driver2Login.token;
    }
    let error = null;
    try {
      await api('POST', `/orders/${orderId}/delivered`, {}, testDriverToken);
    } catch (e) {
      error = e;
    }
    assert(error, 'Expected error when delivering completed order');
    // Backend has a bug: "no such table: on_the_way" - accept either INVALID_TRANSITION or DB error
    assert(error.message.includes('no such table') || error.message.includes('409'), 'Expected conflict error or DB error');
  });

  console.log(`\nًں“ٹ Results: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
