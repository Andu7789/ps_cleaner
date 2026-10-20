-- Bank details printed on customer invoices, one block of text per business.
alter table "PS_CLEAN_businesses"
  add column if not exists payment_details text;

update "PS_CLEAN_businesses"
set payment_details = E'Revolut Business\nTHE WHITE GLOVE CLEANING ORGANISATION LTD\nAccount number: 90232633\nSort code: 23-01-63'
where slug = 'ps-clean';
