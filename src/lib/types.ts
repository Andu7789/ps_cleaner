export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed" | "no_show";
export type PaymentType = "deposit" | "full" | "balance" | "refund" | "cancellation_fee";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export interface Cleaner {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  photo_url: string | null;
  calendar_color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price_pence: number;
  deposit_pence: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Addon {
  id: string;
  name: string;
  description: string | null;
  price_pence: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingAddon {
  id: string;
  booking_id: string;
  addon_id: string | null;
  name: string;
  price_pence: number;
}

export interface WorkingHours {
  id: string;
  cleaner_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
}

export interface TimeOff {
  id: string;
  cleaner_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface Customer {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  stripe_customer_id: string | null;
  stripe_default_payment_method_id: string | null;
  referral_code: string | null;
  referred_by_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CreditReason = "referral_bonus" | "referred_signup_bonus" | "loyalty_reward" | "redeemed";

export interface CustomerCredit {
  id: string;
  customer_id: string;
  amount_pence: number;
  reason: CreditReason;
  related_booking_id: string | null;
  created_at: string;
}

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  access_notes: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  cleaner_id: string;
  service_id: string;
  address_id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price_pence: number;
  deposit_pence: number;
  amount_paid_pence: number;
  notes: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  recurring_booking_id: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurringFrequency = "weekly" | "fortnightly" | "monthly";

export interface RecurringBooking {
  id: string;
  customer_id: string;
  cleaner_id: string;
  service_id: string;
  address_id: string;
  frequency: RecurringFrequency;
  time_of_day: string;
  next_occurrence_date: string;
  is_active: boolean;
  last_generation_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  cleaner_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface CleanerRating {
  average_rating: number | null;
  review_count: number;
}

export interface CleanerPayout {
  id: string;
  cleaner_id: string;
  period_start: string;
  period_end: string;
  booking_count: number;
  total_minutes: number;
  total_revenue_pence: number;
  notes: string | null;
  paid_by: string | null;
  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  customer_id: string;
  service_id: string;
  cleaner_id: string | null;
  wanted_date: string;
  notified_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  stripe_payment_intent_id: string | null;
  type: PaymentType;
  amount_pence: number;
  status: PaymentStatus;
  failure_message: string | null;
  created_at: string;
}

export type PhotoKind = "before" | "after";

export interface BookingPhoto {
  id: string;
  booking_id: string;
  kind: PhotoKind;
  storage_path: string;
  uploaded_by_cleaner_id: string;
  created_at: string;
}

export interface FreeSlotRange {
  cleaner_id: string;
  free_start: string;
  free_end: string;
}

export interface BusinessSettings {
  business_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  timezone: string;
  reminder_hours_before: number;
  balance_charge_days_before: number;
}
