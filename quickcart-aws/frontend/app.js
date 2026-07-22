// ==========================================================
// QuickCart Frontend Logic
// Talks to API Gateway -> Lambda -> SQS -> Lambda -> DynamoDB
// ==========================================================

// TODO: replace with your real API Gateway invoke URL, e.g.
// "https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod"
const API_URL = "https://oafo28wjl1.execute-api.ap-south-1.amazonaws.com/prod";

const PRODUCTS = [
  { id: "p1", name: "QuickCart T-Shirt", price: 19.99 },
  { id: "p2", name: "QuickCart Mug", price: 9.99 },
  { id: "p3", name: "QuickCart Hoodie", price: 39.99 },
  { id: "p4", name: "QuickCart Sticker Pack", price: 4.99 },
];

function renderProducts() {
  const wrap = document.getElementById("products");
  wrap.innerHTML = PRODUCTS.map(p => `
    <div class="product-card">
      <h3>${p.name}</h3>
      <div class="price">$${p.price.toFixed(2)}</div>
      <button onclick="placeOrder('${p.id}', '${p.name}', ${p.price})">
        Place Order
      </button>
    </div>
  `).join("");
}

async function placeOrder(productId, productName, price) {
  const order = {
    orderId: crypto.randomUUID(),
    productId,
    productName,
    price,
    placedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${API_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });

    if (!res.ok) throw new Error(`API returned ${res.status}`);

    alert(`Order placed for ${productName}! Order ID: ${order.orderId}`);
    setTimeout(loadOrders, 1500); // give ProcessOrder Lambda time to run
  } catch (err) {
    console.error("Order failed:", err);
    alert("Order failed — check console and confirm API_URL is set correctly.");
  }
}

async function loadOrders() {
  const body = document.getElementById("ordersBody");
  try {
    const res = await fetch(`${API_URL}/orders`);
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const orders = await res.json();

    if (!orders.length) {
      body.innerHTML = `<tr><td colspan="4" class="muted">No orders yet — place one above.</td></tr>`;
      return;
    }

    body.innerHTML = orders
      .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt))
      .map(o => `
        <tr>
          <td>${o.orderId.slice(0, 8)}...</td>
          <td>${o.productName}</td>
          <td><span class="badge ${o.status}">${o.status}</span></td>
          <td>${new Date(o.placedAt).toLocaleTimeString()}</td>
        </tr>
      `).join("");
  } catch (err) {
    console.error("Failed to load orders:", err);
  }
}

renderProducts();
loadOrders();
setInterval(loadOrders, 5000); // poll every 5s for live status updates
