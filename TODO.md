# To do (things only Andrew can do)

Everything in the code is built and deployed. This file is the list of outside tasks: Stripe, domains and a few decisions. Tick them off as you go.

Migrations 0046 to 0049 are applied. Deploys happen by pushing to `main`, and Vercel builds it.

## 1. Stripe, before taking real money

PS Clean moves to Paige's Stripe account when it goes live. Paige's account is the platform account, so it holds the keys for every business.

- [ ] **Open or confirm Paige's Stripe account** and finish its business verification. Payouts won't work until Stripe has approved it.
- [ ] **Turn on Connect** in that account (Settings, Connect). Choose Express accounts, country United Kingdom. Stripe asks for a short platform profile and for the platform to accept responsibility for refunds and disputes. Only needed for businesses that get paid into their own Stripe account.
- [ ] **Test the whole flow in test mode first**, before touching live keys:
  - [ ] Book and pay on a business set to "Platform Stripe account".
  - [ ] Book and pay on a business set to "Owner's own Stripe account". Use the owner's Settings page and Stripe's test details to finish onboarding. Card payments stay off until Stripe reports the account ready.
  - [ ] Cancel a booking and check the refund shows up.
- [ ] **Register the main webhook** in Stripe (Developers, Webhooks):
  - URL: `https://psclean.site/api/webhooks/stripe`
  - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
  - Copy its signing secret.
- [ ] **Register a second webhook for Connect**, same URL, set to listen to events on connected accounts, with the event `account.updated`. Copy its signing secret. This is what tells the site an owner has finished their Stripe setup.
- [ ] **Update the environment variables in Vercel** (Settings, Environment Variables, Production), then redeploy:
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET` (the main webhook's secret)
  - `STRIPE_CONNECT_WEBHOOK_SECRET` (the Connect webhook's secret, new)
- [ ] **Clear out test bookings before going live.** Saved cards and payment records belong to the old Stripe account and won't carry over to Paige's.
- [ ] **Switch to the live keys last**, once every test above has passed.
- [ ] **Agree with Paige how refunds work.** She is the account holder, so refunds and disputes are hers. When refunding a payment that was sent on to an owner's own account, tick "reverse transfer" so the money comes back from them.
- [ ] **Decide how to bill Paige per new account.** Nothing in the app does this. Each provisioned business has a `provisioned_at` date in the platform portal's data if you want a monthly list built.

## 2. Domains

- [x] `*.psclean.site` works already (Vercel nameservers, wildcard record, valid certificate). Any address an owner picks is live the moment you set them up.
- [ ] **Owners who want their own domain:** add it in the Vercel project (Settings, Domains), then the owner adds the DNS record Vercel shows them at their registrar. Put the domain on the business in the platform portal's request, or in the `custom_domain` column. This part is manual for now.
- [ ] **Vercel connection:** the Vercel connector can't see the `ps-clean-booking` project (it reports no projects in the team), so I couldn't manage domains through it. Worth checking it's connected to the right Vercel team.

## 3. Email and texts

- [x] Every business now sends under its own name, and replies go to the owner's contact email. The mail is still delivered from `bookings@psclean.site`.
- [ ] **Optional, later:** a sending domain per business (for example `mail.acme.co.uk`) so mail comes from the owner's own address. Needs the owner to add DNS records, and Resend limits how many domains your plan allows.
- [ ] **Text messages:** every business uses your one Twilio number. Decide whether that's fine or whether each business needs its own.

## 4. Platform portal

- [ ] **Add another platform admin** if you need one. Run this in the Supabase SQL editor, then they sign in at `/platform/login`:
  ```sql
  insert into "PS_CLEAN_platform_admins" (email) values ('their.email@example.com');
  ```
- [ ] **Two sign in accounts aren't attached to any business** (`testandu1a@gmail.com`, `contactsavannahjade@gmail.com`). Delete them in Supabase (Authentication, Users) if you don't need them.
- [ ] **Throttle the owner link actions** (saving, checking an address, logo upload) if the portal ever gets exposed widely. The links are unguessable, so this is low risk today.

## 5. Before the first real client

- [ ] Walk through the owner form once on your phone.
- [ ] Set up a test business end to end and check the welcome email arrives and the password link works.
- [ ] Confirm the owner can open Settings, upload a logo and see the card payments panel.
- [ ] Delete the test business from its danger zone when you're done.
