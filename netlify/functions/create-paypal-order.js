exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const amount = String(body.amount || "").trim();
    const currency = String(body.currency || "JPY").trim().toUpperCase();
    const unlockKey = String(body.unlockKey || "").trim();

    if (!amount) {
      return json(400, { ok: false, error: "amount_required" });
    }

    if (!unlockKey) {
      return json(400, { ok: false, error: "unlockKey_required" });
    }

    const amountNumber = Number(amount);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return json(400, { ok: false, error: "invalid_amount" });
    }

    if (!Number.isInteger(amountNumber)) {
      return json(400, { ok: false, error: "amount_must_be_integer" });
    }

    if (amountNumber < 100) {
      return json(400, { ok: false, error: "amount_too_small" });
    }

    if (amountNumber > 10000) {
      return json(400, { ok: false, error: "amount_too_large" });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return json(500, { ok: false, error: "paypal_env_missing" });
    }

    const accessToken = await getPayPalAccessToken(clientId, clientSecret);

    const orderRes = await fetch("https://api-m.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: unlockKey,
            amount: {
              currency_code: currency,
              value: String(amountNumber),
            },
            description: "今日の大吉 賽銭",
          },
        ],
      }),
    });

    const orderJson = await orderRes.json();

    if (!orderRes.ok) {
      console.error("create order failed:", orderJson);
      return json(500, {
        ok: false,
        error: orderJson?.message || "paypal_create_order_failed",
        details: orderJson,
      });
    }

    return json(200, {
      ok: true,
      orderID: orderJson.id,
    });
  } catch (err) {
    console.error(err);
    return json(500, {
      ok: false,
      error: err?.message || "server_error",
    });
  }
};

async function getPayPalAccessToken(clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const jsonData = await res.json();

  if (!res.ok || !jsonData.access_token) {
    console.error("oauth failed:", jsonData);
    throw new Error(jsonData?.error_description || "paypal_oauth_failed");
  }

  return jsonData.access_token;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}