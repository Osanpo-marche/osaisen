exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const orderID = String(body.orderID || "").trim();
    const unlockKey = String(body.unlockKey || "").trim();

    if (!orderID) {
      return json(400, { ok: false, error: "orderID_required" });
    }

    if (!unlockKey) {
      return json(400, { ok: false, error: "unlockKey_required" });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return json(500, { ok: false, error: "paypal_env_missing" });
    }

    const accessToken = await getPayPalAccessToken(clientId, clientSecret);

    const captureRes = await fetch(
      `https://api-m.paypal.com/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const captureJson = await captureRes.json();

    if (!captureRes.ok) {
      console.error("capture failed:", captureJson);
      return json(500, {
        ok: false,
        error: captureJson?.message || "paypal_capture_failed",
        details: captureJson,
      });
    }

    const status = captureJson?.status || "";
    const purchaseUnit = captureJson?.purchase_units?.[0];
    const capturedReferenceId = String(purchaseUnit?.reference_id || "").trim();

    if (status !== "COMPLETED") {
      console.error("capture not completed:", captureJson);
      return json(400, {
        ok: false,
        error: "paypal_capture_not_completed",
        details: captureJson,
      });
    }

    if (capturedReferenceId && capturedReferenceId !== unlockKey) {
      return json(400, {
        ok: false,
        error: "unlockKey_mismatch",
      });
    }

    return json(200, {
      ok: true,
      status,
      orderID,
      captureID:
        purchaseUnit?.payments?.captures?.[0]?.id || "",
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