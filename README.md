# AnyShop — customizable e-commerce starter

A responsive customer storefront plus a private, password-protected admin area. Admins can add, edit, hide and delete products, manage stock, and update order status. Customers see only the storefront and checkout; admin APIs require an authenticated server-side session.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set a strong `SESSION_SECRET` and `ADMIN_PASSWORD`. Keep `.env` private; never upload it to Git.
5. Configure SMTP (see below).
6. Run `npm start` and open `http://localhost:3000`.

The initial admin email defaults to `kawsarkamal59@gmail.com`. The password is the value you set as `ADMIN_PASSWORD`. The first startup creates the admin account. Changing `ADMIN_PASSWORD` later does not automatically change an already-created account; use a password-reset flow before production if you need to rotate it.

## Email order notifications

Orders are saved in the database first. If SMTP is configured, the server emails the order details to `ORDER_NOTIFY_EMAIL` (defaults to `kawsarkamal59@gmail.com`). Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_SECURE` / `SMTP_FROM` in `.env`.

For Gmail, use Google's SMTP server (`smtp.gmail.com`) and an App Password if your Google account is eligible and 2-Step Verification is enabled. Do not put your normal Gmail password in the app. Provider setup requirements can change; follow your email provider's current instructions.

If SMTP is not configured, checkout still saves orders, but email notifications are not sent. The customer receives a message indicating that email setup is incomplete.

## Before going live

- Deploy to a Node.js host that supports persistent storage, HTTPS, and SQLite (or migrate SQLite to a managed database).
- Set `NODE_ENV=production`, a long random `SESSION_SECRET`, and secure SMTP credentials in the host's secret/environment settings.
- Use a persistent disk for `shop.db` and `sessions.db`; ephemeral filesystems can erase orders.
- Add a backup plan, privacy/returns/shipping information, tax and payment handling, and test email delivery.
- This starter collects orders but does **not** process online card/mobile-wallet payments. You can arrange payment on delivery or integrate a payment provider separately.
- Add CSRF protection, stronger admin recovery, audit logging, and operational monitoring before handling significant production traffic.

## Customization

Change `STORE_NAME` and `STORE_CURRENCY` in `.env`. Add products and categories in the Admin area; the category names automatically become storefront filters. Add a product image by pasting a public image URL. Customers can browse, add items to their bag, and submit delivery details.
