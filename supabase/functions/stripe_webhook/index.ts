/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "https://esm.sh/stripe@14.25.0";
import { stripe } from "./stripe/config.ts";
import {
  // deletePriceRecord,
  // deleteProductRecord,
  manageSubscriptionStatusChange,
  // upsertPriceRecord,
  // upsertProductRecord,
} from "./utils/admin.ts";

const relevantEvents = new Set([
  "product.created",
  "product.updated",
  "product.deleted",
  "price.created",
  "price.updated",
  "price.deleted",
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") as string;
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  let event: Stripe.Event;

  try {
    if (!sig || !webhookSecret) {
      return Response.json({ error: "Webhook secret not found." }, {
        status: 500,
      });
    }
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    console.log(`🔔  Webhook received: ${event.type}`);
  } catch (err: any) {
    console.error(`❌ Error message: ${err.message}`);
    return Response.json({ error: `Webhook Error: ${err.message}` }, {
      status: 400,
    });
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        // case "product.created":
        // case "product.updated":
        //   await upsertProductRecord(event.data.object as Stripe.Product);
        //   break;
        // case "price.created":
        // case "price.updated":
        //   await upsertPriceRecord(event.data.object as Stripe.Price);
        //   break;
        // case "price.deleted":
        //   await deletePriceRecord(event.data.object as Stripe.Price);
        //   break;
        // case "product.deleted":
        //   await deleteProductRecord(event.data.object as Stripe.Product);
        //   break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await manageSubscriptionStatusChange(
            subscription.id,
            subscription.customer as string,
            event.type === "customer.subscription.created",
          );
          break;
        }
        case "checkout.session.completed": {
          const checkoutSession = event.data.object as Stripe.Checkout.Session;
          if (checkoutSession.mode === "subscription") {
            const subscriptionId = checkoutSession.subscription;
            await manageSubscriptionStatusChange(
              subscriptionId as string,
              checkoutSession.customer as string,
              true,
            );
          }
          break;
        }
        default:
          throw new Error("Unhandled relevant event!");
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: `Error processing webhook: ${message}` }, {
        status: 400,
      });
    }
  } else {
    console.info(`🟠 Ignoring event: ${event.type}`);
    return Response.json({ error: `Unsupported event type: ${event.type}` }, {
      status: 400,
    });
  }

  return Response.json({ received: true });
});
