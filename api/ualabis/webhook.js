export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const notification = req.body;

    console.log("UALA WEBHOOK:", notification);

    const {
      uuid,
      external_reference,
      status,
      created_date,
      api_version
    } = notification || {};

    console.log("UALA PAYMENT STATUS:", {
      uuid,
      external_reference,
      status,
      created_date,
      api_version
    });

    if (!uuid || !external_reference || !status) {
      console.error(
        "Webhook recibido con datos incompletos."
      );

      return res.status(400).json({
        ok: false,
        error: "Notificación Ualá incompleta."
      });
    }

    if (status === "APPROVED") {
      console.log(
        `Pago APROBADO: ${external_reference}`
      );
    }

    if (status === "PROCESSED") {
      console.log(
        `Pago PROCESADO: ${external_reference}`
      );
    }

    if (status === "REJECTED") {
      console.log(
        `Pago RECHAZADO: ${external_reference}`
      );
    }

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      ok: false,
      error: "Error interno procesando webhook."
    });
  }
}
