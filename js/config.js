/* BizDyali auth config. The ONLY place with deployment settings.
 * provider: 'mock' (localhost only) or 'supabase' (real backend).
 * verifyType is a config constant on purpose: confirm the correct value
 * against a live project as a FIRST live test (see docs/AUTH.md).
 * otpResendSeconds comes from the provider, never hardcoded in UI. */
(function (global) {
  'use strict';
  global.BizConfig = {
    provider: 'mock',
    supabaseUrl: '',
    supabaseAnonKey: '',
    verifyType: 'sms',
    channel: 'whatsapp',
    smsFallback: false,
    captchaSiteKey: '',
    otpResendSeconds: 60,
    sessionTtlSec: 30 * 24 * 3600,
    ownerPhone: '',
    salesWhatsApp: '212631522155'
  };
})(window);
