-- Administrative complimentary tickets carry no invented guest consent.
begin;
alter table public.st_event_reservations
  alter column privacy_consent_at drop not null,
  alter column privacy_policy_version drop not null,
  alter column terms_accepted_at drop not null,
  alter column terms_version drop not null;
alter table public.st_event_reservations
  add constraint st_event_reservations_legal_or_admin_courtesy_check check (
    (privacy_consent_at is not null and privacy_policy_version is not null
      and terms_accepted_at is not null and terms_version is not null)
    or
    (invitation_code is not null and invitation_code like 'ADMIN-CORTESIA-%'
      and amount = 0 and bold_reference is null and bold_payment_id is null
      and privacy_consent_at is null and privacy_policy_version is null
      and terms_accepted_at is null and terms_version is null)
  );
commit;
